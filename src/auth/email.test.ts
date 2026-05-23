import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ emails: { send } })),
}));

const logs: string[] = [];
vi.mock("@/lib/logger", () => ({
  logger: () => ({
    info: (obj: object, msg: string) => logs.push(`info:${JSON.stringify(obj)}:${msg}`),
    warn: (obj: object, msg: string) => logs.push(`warn:${JSON.stringify(obj)}:${msg}`),
    error: (obj: object, msg: string) => logs.push(`error:${JSON.stringify(obj)}:${msg}`),
  }),
}));

beforeEach(() => {
  logs.length = 0;
  send.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sendEmail", () => {
  it("logs the email instead of sending when RESEND_API_KEY is absent", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const { sendEmail } = await import("./email");
    await sendEmail({
      to: "user@example.com",
      subject: "hello",
      html: "<p>hi</p>",
      text: "hi",
    });
    expect(send).not.toHaveBeenCalled();
    expect(logs.some((l) => l.includes("email:dry-run"))).toBe(true);
  });

  it("calls Resend.emails.send when key is present", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "noreply@example.com");
    send.mockResolvedValue({ data: { id: "msg-1" }, error: null });
    vi.resetModules();
    const { sendEmail } = await import("./email");
    await sendEmail({
      to: "user@example.com",
      subject: "hello",
      html: "<p>hi</p>",
      text: "hi",
    });
    expect(send).toHaveBeenCalledWith({
      from: "noreply@example.com",
      to: "user@example.com",
      subject: "hello",
      html: "<p>hi</p>",
      text: "hi",
    });
  });

  it("throws when Resend returns an error", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    send.mockResolvedValue({ data: null, error: { message: "boom" } });
    vi.resetModules();
    const { sendEmail } = await import("./email");
    await expect(
      sendEmail({ to: "u@example.com", subject: "x", html: "x", text: "x" }),
    ).rejects.toThrow(/boom/);
  });
});
