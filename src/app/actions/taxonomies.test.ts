import { afterEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.fn();
vi.mock("@/auth/context", () => ({
  requireRole: (...a: unknown[]) => requireRole(...a),
  AuthRequiredError: class extends Error {},
  PermissionDeniedError: class extends Error {},
}));
const createTaxonomy = vi.fn();
const attachTaxonomyToPost = vi.fn();
const detachTaxonomyFromPost = vi.fn();
vi.mock("@/taxonomies/service", () => ({
  createTaxonomy: (...a: unknown[]) => createTaxonomy(...a),
  attachTaxonomyToPost: (...a: unknown[]) => attachTaxonomyToPost(...a),
  detachTaxonomyFromPost: (...a: unknown[]) => detachTaxonomyFromPost(...a),
  TaxonomyExistsError: class extends Error {},
}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { createTaxonomyAction, attachTaxonomyAction } = await import("./taxonomies");

afterEach(() => {
  requireRole.mockReset();
  createTaxonomy.mockReset();
  attachTaxonomyToPost.mockReset();
  detachTaxonomyFromPost.mockReset();
  revalidatePath.mockReset();
});

function fd(o: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
}

describe("createTaxonomyAction", () => {
  it("requires editor+", async () => {
    requireRole.mockRejectedValue(new Error("forbidden"));
    const r = await createTaxonomyAction(undefined, fd({ type: "category", name: "News" }));
    expect(r.error).toMatch(/forbid|sign in/i);
    expect(createTaxonomy).not.toHaveBeenCalled();
  });
  it("creates and revalidates", async () => {
    requireRole.mockResolvedValue({ id: "u" });
    createTaxonomy.mockResolvedValue({ id: "t-1" });
    await createTaxonomyAction(undefined, fd({ type: "category", name: "News" }));
    expect(createTaxonomy).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/admin/taxonomies");
  });
});

describe("attachTaxonomyAction", () => {
  it("attaches", async () => {
    requireRole.mockResolvedValue({ id: "u" });
    await attachTaxonomyAction(
      undefined,
      fd({
        postId: "11111111-1111-1111-1111-111111111111",
        taxonomyId: "22222222-2222-2222-2222-222222222222",
      }),
    );
    expect(attachTaxonomyToPost).toHaveBeenCalled();
  });
});
