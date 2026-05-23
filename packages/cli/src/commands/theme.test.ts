import { afterEach, describe, expect, it, vi } from "vitest";

const remoteRequest = vi.fn();
vi.mock("../transport", () => ({
  remoteRequest: (...a: unknown[]) => remoteRequest(...a),
}));

const { themeCommand } = await import("./theme");

afterEach(() => {
  remoteRequest.mockReset();
});

describe("theme activate", () => {
  it("POSTs slug to /api/cli/themes/activate", async () => {
    remoteRequest.mockResolvedValue({ ok: true });
    const cmd = themeCommand({});
    await cmd.parseAsync(["activate", "wpk-default"], { from: "user" });
    expect(remoteRequest).toHaveBeenCalledWith(
      "POST",
      "/api/cli/themes/activate",
      { slug: "wpk-default" },
      {},
    );
  });
});
