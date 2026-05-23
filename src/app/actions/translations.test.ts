import { afterEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
vi.mock("@/auth/context", () => ({ requireUser: () => requireUser() }));
const getPostById = vi.fn();
const createPost = vi.fn();
vi.mock("@/posts/service", () => ({
  getPostById: (...a: unknown[]) => getPostById(...a),
  createPost: (...a: unknown[]) => createPost(...a),
}));
const getPageById = vi.fn();
const createPage = vi.fn();
vi.mock("@/services/pages/service", () => ({
  getPageById: (...a: unknown[]) => getPageById(...a),
  createPage: (...a: unknown[]) => createPage(...a),
}));
const translateBlocks = vi.fn();
vi.mock("@/ai/features/translate", () => ({
  translateBlocks: (...a: unknown[]) => translateBlocks(...a),
}));
const findCanonicalId = vi.fn();
vi.mock("@/i18n/translations", () => ({
  findCanonicalId: (...a: unknown[]) => findCanonicalId(...a),
}));
const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect }));

const { translatePostAction } = await import("./translations");

afterEach(() => {
  requireUser.mockReset();
  getPostById.mockReset();
  createPost.mockReset();
  getPageById.mockReset();
  createPage.mockReset();
  translateBlocks.mockReset();
  findCanonicalId.mockReset();
  redirect.mockReset();
});

function fd(o: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
}

describe("translatePostAction", () => {
  it("creates a new post row pointing to canonical with AI-translated blocks", async () => {
    requireUser.mockResolvedValue({ id: "u-1" });
    getPostById.mockResolvedValue({
      id: "p-1",
      title: "Hello",
      slug: "hello",
      excerpt: null,
      blocks: [{ id: "h", type: "heading", level: 1, text: "Hello" }],
      locale: "en",
      authorId: "u-1",
    });
    findCanonicalId.mockResolvedValue("p-1");
    translateBlocks.mockResolvedValue({
      kind: "ok",
      blocks: [{ id: "h", type: "heading", level: 1, text: "Bonjour" }],
    });
    createPost.mockResolvedValue({ id: "p-2", slug: "hello", locale: "fr" });

    await translatePostAction(
      undefined,
      fd({ postId: "11111111-1111-1111-1111-111111111111", targetLocale: "fr" }),
    );
    expect(createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "fr",
        translationOf: "p-1",
        blocks: [{ id: "h", type: "heading", level: 1, text: "Bonjour" }],
      }),
      "u-1",
    );
    expect(redirect).toHaveBeenCalled();
  });

  it("falls back to original blocks when AI is disabled", async () => {
    requireUser.mockResolvedValue({ id: "u-1" });
    getPostById.mockResolvedValue({
      id: "p-1",
      title: "Hello",
      slug: "hello",
      excerpt: null,
      blocks: [{ id: "h", type: "heading", level: 1, text: "Hello" }],
      locale: "en",
      authorId: "u-1",
    });
    findCanonicalId.mockResolvedValue("p-1");
    translateBlocks.mockResolvedValue({ kind: "disabled", reason: "x" });
    createPost.mockResolvedValue({ id: "p-2", slug: "hello", locale: "fr" });
    await translatePostAction(
      undefined,
      fd({ postId: "11111111-1111-1111-1111-111111111111", targetLocale: "fr" }),
    );
    expect(createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        blocks: [{ id: "h", type: "heading", level: 1, text: "Hello" }],
      }),
      "u-1",
    );
  });
});
