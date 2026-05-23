import { afterEach, describe, expect, it, vi } from "vitest";

const createPost = vi.fn();
const createPage = vi.fn();
const attachTaxonomyToPost = vi.fn();
vi.mock("@/posts/service", () => ({ createPost: (...a: unknown[]) => createPost(...a) }));
vi.mock("@/services/pages/service", () => ({
  createPage: (...a: unknown[]) => createPage(...a),
}));
vi.mock("@/taxonomies/service", () => ({
  attachTaxonomyToPost: (...a: unknown[]) => attachTaxonomyToPost(...a),
}));
const resolveUserByEmail = vi.fn().mockResolvedValue("u-1");
const ensureTaxonomy = vi.fn().mockResolvedValue("t-1");
vi.mock("./resolve", () => ({
  resolveUserByEmail: (...a: unknown[]) => resolveUserByEmail(...a),
  ensureTaxonomy: (...a: unknown[]) => ensureTaxonomy(...a),
}));
const updateImportProgress = vi.fn();
vi.mock("./jobs", () => ({
  updateImportProgress: (...a: unknown[]) => updateImportProgress(...a),
  markImportCompleted: vi.fn(),
  markImportFailed: vi.fn(),
  ZERO_PROGRESS: {
    processed: 0,
    users: 0,
    posts: 0,
    pages: 0,
    media: 0,
    taxonomies: 0,
    comments: 0,
    errors: 0,
  },
}));

const { runImportRecords } = await import("./runner");

afterEach(() => {
  createPost.mockReset();
  createPage.mockReset();
  attachTaxonomyToPost.mockReset();
  updateImportProgress.mockReset();
});

describe("runImportRecords", () => {
  it("creates posts, attaches taxonomies, tracks progress", async () => {
    async function* gen() {
      yield {
        kind: "user" as const,
        externalId: "u-ext",
        email: "a@e.com",
        displayName: "A",
        role: "author" as const,
      };
      yield {
        kind: "taxonomy" as const,
        externalId: "t-ext",
        type: "tag",
        slug: "news",
        name: "News",
      };
      yield {
        kind: "post" as const,
        externalId: "p-ext",
        title: "T",
        slug: "t",
        status: "published" as const,
        bodyMarkdown: "# Hi",
        authorExternalId: "u-ext",
        taxonomyRefs: [{ type: "tag", slug: "news" }],
        locale: "en",
      };
    }
    createPost.mockResolvedValue({ id: "p-1" });
    await runImportRecords({
      importJobId: "j-1",
      source: "csv",
      records: gen(),
      fallbackAuthorId: "u-fallback",
      defaultLocale: "en",
      bucket: "wpk-media",
    });
    expect(createPost).toHaveBeenCalled();
    expect(attachTaxonomyToPost).toHaveBeenCalledWith("p-1", "t-1");
    expect(updateImportProgress).toHaveBeenCalled();
  });
});
