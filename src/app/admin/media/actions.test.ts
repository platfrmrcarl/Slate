import { afterEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.fn();
vi.mock("@/auth/context", () => ({
  requireRole: (...a: unknown[]) => requireRole(...a),
  AuthRequiredError: class extends Error {},
  PermissionDeniedError: class extends Error {},
}));
const updateMediaAltText = vi.fn();
vi.mock("@/media/service", () => ({
  updateMediaAltText: (...a: unknown[]) => updateMediaAltText(...a),
}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { updateAltTextAction } = await import("./actions");

afterEach(() => {
  requireRole.mockReset();
  updateMediaAltText.mockReset();
  revalidatePath.mockReset();
});

function fd(o: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
}

describe("updateAltTextAction", () => {
  it("updates and revalidates /admin/media", async () => {
    requireRole.mockResolvedValue({ id: "u-1", role: "editor" });
    await updateAltTextAction(
      undefined,
      fd({ id: "11111111-1111-1111-1111-111111111111", altText: "A nice photo" }),
    );
    expect(updateMediaAltText).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      "A nice photo",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/admin/media");
  });

  it("returns error when not allowed", async () => {
    requireRole.mockRejectedValue(new Error("permission denied"));
    const result = await updateAltTextAction(
      undefined,
      fd({ id: "11111111-1111-1111-1111-111111111111", altText: "x" }),
    );
    expect(result.error).toMatch(/forbidden/i);
  });

  it("accepts empty string to clear alt text", async () => {
    requireRole.mockResolvedValue({ id: "u-1", role: "editor" });
    await updateAltTextAction(
      undefined,
      fd({ id: "11111111-1111-1111-1111-111111111111", altText: "" }),
    );
    expect(updateMediaAltText).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111", null);
  });
});
