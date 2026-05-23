import { describe, expect, it, vi } from "vitest";

vi.stubEnv("AI_MODEL_GENERATE_PAGE", "claude-opus-4-7");
vi.stubEnv("AI_MODEL_REWRITE", "claude-haiku-4-5");

const { modelFor, MAX_TOKENS } = await import("./models");

describe("modelFor", () => {
  it("returns env-overridable defaults per feature", () => {
    expect(modelFor("generate-page")).toBe("claude-opus-4-7");
    expect(modelFor("rewrite")).toBe("claude-haiku-4-5");
  });

  it("returns fallback when env var is unset", () => {
    delete process.env.AI_MODEL_TRANSLATE;
    expect(modelFor("translate")).toBe("claude-sonnet-4-6");
  });
});

describe("MAX_TOKENS", () => {
  it("caps generate-page at 8000", () => {
    expect(MAX_TOKENS["generate-page"]).toBe(8000);
  });
  it("caps inline assists at 2000", () => {
    expect(MAX_TOKENS.rewrite).toBe(2000);
  });
  it("caps spam-classify low", () => {
    expect(MAX_TOKENS["spam-classify"]).toBe(200);
  });
});
