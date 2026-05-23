import { afterEach, describe, expect, it, vi } from "vitest";

const updatePage = vi.fn();
const getPage = vi.fn();
const addRevision = vi.fn();
const publishPage = vi.fn();
const unpublishPage = vi.fn();
const requireUser = vi.fn();

vi.mock("@/services/pages/service", () => ({
  updatePage: (...a: unknown[]) => updatePage(...a),
  getPage: (...a: unknown[]) => getPage(...a),
  deletePage: vi.fn(),
}));
vi.mock("@/services/pages/revisions", () => ({
  addRevision: (...a: unknown[]) => addRevision(...a),
}));
vi.mock("@/services/pages/publish", () => ({
  publishPage: (...a: unknown[]) => publishPage(...a),
  unpublishPage: (...a: unknown[]) => unpublishPage(...a),
}));
vi.mock("@/auth/context", () => ({
  requireUser: () => requireUser(),
  requireRole: () => requireUser(),
}));

const { saveDraftAction, publishAction, unpublishAction } = await import("./actions");

afterEach(() => vi.clearAllMocks());

const sampleBlocks = [{ id: "id12345678", type: "paragraph" as const, markdown: "hi" }];

describe("saveDraftAction", () => {
  it("updates the page and writes a revision", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "editor" });
    getPage.mockResolvedValue({
      id: "p-1",
      title: "Old",
      blocks: [],
      authorId: "u-2",
      status: "draft",
    });
    updatePage.mockResolvedValue({ id: "p-1", title: "New", blocks: sampleBlocks });
    const fd = new FormData();
    fd.append("title", "New");
    fd.append("blocks", JSON.stringify(sampleBlocks));
    await saveDraftAction("p-1", fd);
    expect(updatePage).toHaveBeenCalledWith("p-1", expect.objectContaining({ title: "New" }));
    expect(addRevision).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: "p-1", title: "New", authorId: "u-1" }),
    );
  });

  it("refuses to update a page the actor cannot edit (contributor on someone else's draft)", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "contributor" });
    getPage.mockResolvedValue({
      id: "p-1",
      authorId: "u-other",
      title: "Old",
      blocks: [],
      status: "draft",
    });
    const fd = new FormData();
    fd.append("title", "x");
    fd.append("blocks", JSON.stringify([]));
    await expect(saveDraftAction("p-1", fd)).rejects.toThrow(/permission/i);
  });
});

describe("publishAction / unpublishAction", () => {
  it("publish requires publish:any-post or publish:own-post + ownership", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "author" });
    getPage.mockResolvedValue({ id: "p-1", authorId: "u-1", status: "draft" });
    publishPage.mockResolvedValue({ id: "p-1", status: "published" });
    await publishAction("p-1");
    expect(publishPage).toHaveBeenCalledWith("p-1", { actorId: "u-1" });
  });

  it("publish refuses when author tries to publish someone else's draft", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "author" });
    getPage.mockResolvedValue({ id: "p-1", authorId: "u-other", status: "draft" });
    await expect(publishAction("p-1")).rejects.toThrow(/permission/i);
  });

  it("unpublish delegates to unpublishPage when actor has edit:any-post", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "editor" });
    getPage.mockResolvedValue({ id: "p-1", authorId: "u-other", status: "published" });
    unpublishPage.mockResolvedValue({ id: "p-1", status: "draft" });
    await unpublishAction("p-1");
    expect(unpublishPage).toHaveBeenCalled();
  });
});
