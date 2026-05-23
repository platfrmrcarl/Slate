import { afterEach, describe, expect, it, vi } from "vitest";

const remoteRequest = vi.fn();
const localRun = vi.fn();
vi.mock("../transport", () => ({
  remoteRequest: (...a: unknown[]) => remoteRequest(...a),
  resolveTransport: () => "remote",
  localRun: (...a: unknown[]) => localRun(...a),
}));

const { userCommand } = await import("./user");

afterEach(() => {
  remoteRequest.mockReset();
  localRun.mockReset();
});

describe("user create", () => {
  it("POSTs to /api/cli/users/create with provided args", async () => {
    remoteRequest.mockResolvedValue({ id: "u-1" });
    const cmd = userCommand({});
    await cmd.parseAsync(
      [
        "create",
        "test@example.com",
        "--display-name",
        "Test User",
        "--password",
        "correct horse battery",
        "--role",
        "author",
      ],
      { from: "user" },
    );
    expect(remoteRequest).toHaveBeenCalledWith(
      "POST",
      "/api/cli/users/create",
      expect.objectContaining({ email: "test@example.com", role: "author" }),
      {},
    );
  });
});

describe("user reset-password", () => {
  it("POSTs and prints the URL", async () => {
    remoteRequest.mockResolvedValue({ url: "https://x/reset?token=abc" });
    const cmd = userCommand({});
    await cmd.parseAsync(["reset-password", "test@example.com"], { from: "user" });
    expect(remoteRequest).toHaveBeenCalledWith(
      "POST",
      "/api/cli/users/reset-password",
      { email: "test@example.com" },
      {},
    );
  });
});
