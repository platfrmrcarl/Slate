import { describe, expect, it, vi } from "vitest";

describe("aiEnabled", () => {
  it("returns false when ANTHROPIC_API_KEY is absent", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.resetModules();
    const { aiEnabled } = await import("./disabled");
    expect(aiEnabled()).toBe(false);
  });

  it("returns true when key looks valid", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-xxxxxxxxxxxxxxxx");
    vi.resetModules();
    const { aiEnabled } = await import("./disabled");
    expect(aiEnabled()).toBe(true);
  });

  it("returns false when key has wrong prefix", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-not-anthropic");
    vi.resetModules();
    const { aiEnabled } = await import("./disabled");
    expect(aiEnabled()).toBe(false);
  });
});

describe("disabledResult", () => {
  it("returns a typed disabled result", async () => {
    const { disabledResult } = await import("./disabled");
    const r = disabledResult();
    expect(r.kind).toBe("disabled");
    expect(typeof r.reason).toBe("string");
  });
});
