import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

const resolveSafeIp = vi.fn();
const SsrfErrorClass = class extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
};
vi.mock("./ssrf", () => ({
  resolveSafeIp: (...a: unknown[]) => resolveSafeIp(...a),
  SsrfError: SsrfErrorClass,
}));

// Mock node:https.request. We don't actually open sockets — we capture the
// options object so the test can assert the IP-pinning behaviour, then
// resolve the request with a synthetic response.
const httpsRequest = vi.fn();
vi.mock("node:https", () => ({
  default: { request: (...a: unknown[]) => httpsRequest(...a) },
  request: (...a: unknown[]) => httpsRequest(...a),
}));

const { safeFetch } = await import("./safeFetch");

beforeEach(() => {
  resolveSafeIp.mockReset();
  httpsRequest.mockReset();
});
afterEach(() => vi.useRealTimers());

function fakeRequest(status: number, body: string) {
  return (
    _opts: {
      lookup?: (
        host: string,
        o: unknown,
        cb: (e: Error | null, addr: string, fam: number) => void,
      ) => void;
    },
    cb: (res: EventEmitter & { statusCode: number; headers: Record<string, string> }) => void,
  ) => {
    const req = new EventEmitter() as EventEmitter & {
      write: (b: string) => void;
      end: () => void;
      setTimeout: (ms: number, fn: () => void) => void;
      destroy: (err?: Error) => void;
    };
    req.write = () => {};
    req.end = () => {
      // Trigger the response asynchronously.
      queueMicrotask(() => {
        const res = new EventEmitter() as EventEmitter & {
          statusCode: number;
          headers: Record<string, string>;
        };
        res.statusCode = status;
        res.headers = { "content-type": "text/plain" };
        cb(res);
        queueMicrotask(() => {
          res.emit("data", Buffer.from(body));
          res.emit("end");
        });
      });
    };
    req.setTimeout = () => {};
    req.destroy = (err?: Error) => {
      if (err) req.emit("error", err);
    };
    return req;
  };
}

describe("safeFetch", () => {
  it("propagates SsrfError from resolveSafeIp without dialing", async () => {
    resolveSafeIp.mockRejectedValue(new SsrfErrorClass("blocked: 10.0.0.1"));
    await expect(safeFetch("https://internal/x")).rejects.toBeInstanceOf(SsrfErrorClass);
    expect(httpsRequest).not.toHaveBeenCalled();
  });

  it("pins the resolved IP into the https.request lookup option", async () => {
    resolveSafeIp.mockResolvedValue({
      url: new URL("https://hook.example.test/path?q=1"),
      ip: "203.0.113.42",
      family: 4,
    });
    httpsRequest.mockImplementation(fakeRequest(200, "ok"));
    const res = await safeFetch("https://hook.example.test/path?q=1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");

    const [opts] = httpsRequest.mock.calls[0] ?? [];
    const o = opts as {
      hostname: string;
      path: string;
      method: string;
      headers: Record<string, string>;
      servername: string;
      lookup: (
        host: string,
        o: unknown,
        cb: (e: Error | null, addr: string, fam: number) => void,
      ) => void;
    };
    expect(o.hostname).toBe("hook.example.test");
    expect(o.servername).toBe("hook.example.test"); // SNI matches hostname
    expect(o.path).toBe("/path?q=1");
    expect(o.method).toBe("POST");
    expect(o.headers.host).toBe("hook.example.test");
    expect(o.headers["content-length"]).toBe("2");

    // The lookup override must return the pinned IP regardless of the
    // hostname it's invoked with — that's what defeats DNS rebinding.
    const got = await new Promise<{ addr: string; family: number }>((resolve) =>
      o.lookup("hook.example.test", {}, (_e, addr, family) => resolve({ addr, family })),
    );
    expect(got).toEqual({ addr: "203.0.113.42", family: 4 });

    // And even when called with a different name (paranoid check) it still
    // returns the pinned IP — internal Node code may not pass the original.
    const got2 = await new Promise<{ addr: string }>((resolve) =>
      o.lookup("anything-else", {}, (_e, addr) => resolve({ addr })),
    );
    expect(got2.addr).toBe("203.0.113.42");
  });

  it("auto-sets content-length when body is provided and not preset", async () => {
    resolveSafeIp.mockResolvedValue({
      url: new URL("https://x.example/y"),
      ip: "203.0.113.1",
      family: 4,
    });
    httpsRequest.mockImplementation(fakeRequest(204, ""));
    await safeFetch("https://x.example/y", { method: "POST", body: "hello" });
    const [opts] = httpsRequest.mock.calls[0] ?? [];
    const headers = (opts as { headers: Record<string, string> }).headers;
    expect(headers["content-length"]).toBe("5");
  });
});
