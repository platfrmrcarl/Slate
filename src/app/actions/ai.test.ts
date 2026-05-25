import { afterEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.fn();
vi.mock("@/auth/context", () => ({
  requireRole: (...a: unknown[]) => requireRole(...a),
  AuthRequiredError: class extends Error {},
  PermissionDeniedError: class extends Error {},
}));
const isOverBudget = vi.fn().mockResolvedValue(false);
vi.mock("@/ai/usage", () => ({ isOverBudget: (...a: unknown[]) => isOverBudget(...a) }));
const generatePage = vi.fn();
const rewrite = vi.fn();
const translateBlocks = vi.fn();
const generateSeoMeta = vi.fn();
vi.mock("@/ai/features/generate-page", () => ({
  generatePage: (...a: unknown[]) => generatePage(...a),
}));
vi.mock("@/ai/features/rewrite", () => ({ rewrite: (...a: unknown[]) => rewrite(...a) }));
vi.mock("@/ai/features/translate", () => ({
  translateBlocks: (...a: unknown[]) => translateBlocks(...a),
}));
vi.mock("@/ai/features/seo-meta", () => ({
  generateSeoMeta: (...a: unknown[]) => generateSeoMeta(...a),
}));
const enqueueJob = vi.fn();
vi.mock("@/jobs/enqueue", () => ({
  enqueueJob: (...a: unknown[]) => enqueueJob(...a),
}));

const {
  generatePageAction,
  rewriteAction,
  translateAction,
  autoSeoAction,
  requestMediaAltTextAction,
} = await import("./ai");

afterEach(() => {
  requireRole.mockReset();
  isOverBudget.mockReset();
  isOverBudget.mockResolvedValue(false);
  generatePage.mockReset();
  rewrite.mockReset();
  translateBlocks.mockReset();
  generateSeoMeta.mockReset();
  enqueueJob.mockReset();
});

function fd(o: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
}

describe("generatePageAction", () => {
  it("denies when over budget", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    isOverBudget.mockResolvedValueOnce(true);
    const r = await generatePageAction(
      undefined,
      fd({ prompt: "make this", pageType: "about", themeSlug: "slate-default" }),
    );
    expect(r.error).toMatch(/budget/i);
  });

  it("forwards ok result", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    generatePage.mockResolvedValue({
      kind: "ok",
      blocks: [{ id: "h", type: "heading", level: 1, text: "H" }],
      usage: {},
    });
    const r = await generatePageAction(
      undefined,
      fd({ prompt: "make this", pageType: "about", themeSlug: "slate-default" }),
    );
    expect(r.ok).toBe(true);
    expect(r.blocks).toHaveLength(1);
  });

  it("returns 'AI is disabled' when feature reports disabled", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    generatePage.mockResolvedValue({ kind: "disabled", reason: "no key" });
    const r = await generatePageAction(
      undefined,
      fd({ prompt: "make this", pageType: "about", themeSlug: "slate-default" }),
    );
    expect(r.error).toMatch(/disabled/i);
  });
});

describe("rewriteAction", () => {
  it("returns text", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    rewrite.mockResolvedValue({ kind: "ok", result: "rewritten", usage: {} });
    const r = await rewriteAction(undefined, fd({ mode: "rewrite", tone: "neutral", text: "old" }));
    expect(r.result).toBe("rewritten");
  });
});

describe("translateAction", () => {
  it("returns translated blocks", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    translateBlocks.mockResolvedValue({
      kind: "ok",
      blocks: [{ id: "a", type: "heading", level: 1, text: "X" }],
    });
    const r = await translateAction(
      undefined,
      fd({ blocksJson: JSON.stringify([{ id: "a" }]), targetLocale: "fr" }),
    );
    expect(r.ok).toBe(true);
    expect(r.blocks).toHaveLength(1);
  });

  it("rejects invalid JSON", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    const r = await translateAction(undefined, fd({ blocksJson: "not-json", targetLocale: "fr" }));
    expect(r.error).toMatch(/JSON/i);
  });
});

describe("autoSeoAction", () => {
  it("returns seoTitle + seoDescription", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    generateSeoMeta.mockResolvedValue({ kind: "ok", seoTitle: "T", seoDescription: "D" });
    const r = await autoSeoAction(
      undefined,
      fd({ title: "T", excerpt: "", contentPreview: "body" }),
    );
    expect(r.seoTitle).toBe("T");
    expect(r.seoDescription).toBe("D");
  });
});

describe("requestMediaAltTextAction", () => {
  it("rejects unauthenticated users", async () => {
    requireRole.mockRejectedValue(new (class extends Error {})());
    const r = await requestMediaAltTextAction("00000000-0000-0000-0000-000000000001");
    expect(r.error).toBeDefined();
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("rejects invalid uuid", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    const r = await requestMediaAltTextAction("not-a-uuid");
    expect(r.error).toMatch(/invalid/i);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("enqueues media-alt-text job and returns queued=true", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    enqueueJob.mockResolvedValue(undefined);
    const mediaId = "00000000-0000-0000-0000-000000000001";
    const r = await requestMediaAltTextAction(mediaId);
    expect(r.ok).toBe(true);
    expect(r.queued).toBe(true);
    expect(enqueueJob).toHaveBeenCalledWith("media-alt-text", { mediaId });
  });

  it("surfaces enqueue errors as a friendly message", async () => {
    requireRole.mockResolvedValue({ id: "u-1" });
    enqueueJob.mockRejectedValue(new Error("boom"));
    const r = await requestMediaAltTextAction("00000000-0000-0000-0000-000000000001");
    expect(r.error).toMatch(/enqueue/i);
  });
});
