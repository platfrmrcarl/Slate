import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";

// Mock node:child_process so we never shell out a real pg_dump in tests.
const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({ spawn: (...a: unknown[]) => spawnMock(...a) }));

// Stable env mock — pgDump only reads DATABASE_URL.
vi.mock("@/env", () => ({
  env: () => ({ DATABASE_URL: "postgres://wpk:wpk@localhost:5432/wpk" }),
}));

vi.mock("@/lib/logger", () => ({
  logger: () => ({ debug: () => {}, warn: () => {}, info: () => {}, error: () => {} }),
}));

const { pgDump } = await import("./dump");

function fakeProc(stdoutBytes: Buffer): EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
} {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
  };
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  setImmediate(() => {
    proc.stdout.end(stdoutBytes);
    proc.stderr.end();
  });
  return proc;
}

beforeEach(() => {
  spawnMock.mockReset();
});

afterEach(() => {
  spawnMock.mockReset();
});

describe("pgDump", () => {
  it("shells out to docker compose exec when DATABASE_URL host is localhost", async () => {
    spawnMock.mockReturnValue(fakeProc(Buffer.from("PG-CUSTOM-FAKE-BYTES")));
    const stream = await pgDump();
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = spawnMock.mock.calls[0]!;
    expect(cmd).toBe("docker");
    expect(args).toEqual(
      expect.arrayContaining([
        "compose",
        "exec",
        "-T",
        "postgres",
        "pg_dump",
        "-U",
        "wpk",
        "-d",
        "wpk",
        "--no-owner",
        "--no-acl",
        "--format=custom",
      ]),
    );
    let total = 0;
    for await (const c of stream) total += (c as Buffer).length;
    expect(total).toBeGreaterThan(0);
  });
});
