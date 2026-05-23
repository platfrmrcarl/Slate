import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const can = vi.fn();
vi.mock("@/auth/context", () => ({
  requireUser: () => requireUser(),
  AuthRequiredError: class extends Error {},
  PermissionDeniedError: class extends Error {},
}));
vi.mock("@/auth/permissions", () => ({ can: (...a: unknown[]) => can(...a) }));

const createPost = vi.fn();
const updatePost = vi.fn();
const publishPost = vi.fn();
const getPostById = vi.fn();
const deletePost = vi.fn();
vi.mock("@/posts/service", () => ({
  createPost: (...a: unknown[]) => createPost(...a),
  updatePost: (...a: unknown[]) => updatePost(...a),
  publishPost: (...a: unknown[]) => publishPost(...a),
  getPostById: (...a: unknown[]) => getPostById(...a),
  deletePost: (...a: unknown[]) => deletePost(...a),
}));
const createRevision = vi.fn();
vi.mock("@/posts/revisions", () => ({ createRevision: (...a: unknown[]) => createRevision(...a) }));
const enqueueJob = vi.fn();
vi.mock("@/jobs/enqueue", () => ({ enqueueJob: (...a: unknown[]) => enqueueJob(...a) }));
const revalidatePath = vi.fn();
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
  revalidateTag: (...a: unknown[]) => revalidateTag(...a),
}));
const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (...a: unknown[]) => redirect(...a) }));

const { savePostAction, publishPostAction, deletePostAction } = await import("./posts");

beforeEach(() => {
  requireUser.mockReset();
  can.mockReset();
  createPost.mockReset();
  updatePost.mockReset();
  publishPost.mockReset();
  getPostById.mockReset();
  deletePost.mockReset();
  createRevision.mockReset();
  enqueueJob.mockReset();
  revalidatePath.mockReset();
  revalidateTag.mockReset();
  redirect.mockReset();
});

afterEach(() => vi.restoreAllMocks());

function fd(o: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
}

describe("savePostAction", () => {
  it("creates when id is absent and contributor is allowed for own", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "contributor" });
    can.mockReturnValue(true);
    createPost.mockResolvedValue({ id: "p-1", slug: "x", locale: "en" });
    await savePostAction(
      undefined,
      fd({ title: "t", blocks: "[]", categoryIds: "[]", tagIds: "[]" }),
    );
    expect(createPost).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/admin/posts/p-1");
  });

  it("forbids non-owner edits when actor isn't editor+", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "contributor" });
    can.mockReturnValueOnce(false).mockReturnValueOnce(false);
    getPostById.mockResolvedValue({ id: "11111111-1111-1111-1111-111111111111", authorId: "u-other" });
    const r = await savePostAction(
      undefined,
      fd({
        id: "11111111-1111-1111-1111-111111111111",
        title: "t",
        blocks: "[]",
        categoryIds: "[]",
        tagIds: "[]",
      }),
    );
    expect(r?.error).toMatch(/forbidden/i);
  });
});

describe("publishPostAction", () => {
  it("publishes, snapshots revision, enqueues revalidate", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "editor" });
    can.mockReturnValue(true);
    getPostById.mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      title: "t",
      excerpt: "e",
      blocks: [],
      slug: "s",
      locale: "en",
      authorId: "u-1",
    });
    publishPost.mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      slug: "s",
      locale: "en",
    });
    await publishPostAction(undefined, fd({ id: "11111111-1111-1111-1111-111111111111" }));
    expect(createRevision).toHaveBeenCalled();
    expect(enqueueJob).toHaveBeenCalledWith(
      "revalidate",
      expect.objectContaining({ path: "/blog/s" }),
    );
    expect(revalidateTag).toHaveBeenCalled();
  });
});

describe("deletePostAction", () => {
  it("requires delete permission", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "author" });
    can.mockReturnValue(false);
    getPostById.mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      authorId: "u-other",
    });
    const r = await deletePostAction(
      undefined,
      fd({ id: "11111111-1111-1111-1111-111111111111" }),
    );
    expect(r?.error).toMatch(/forbidden/i);
    expect(deletePost).not.toHaveBeenCalled();
  });
});
