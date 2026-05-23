import { afterEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.fn();
vi.mock("@/auth/context", () => ({
  requireRole: () => requireRole(),
  AuthRequiredError: class extends Error {},
  PermissionDeniedError: class extends Error {},
}));
const activateTheme = vi.fn();
const setCustomization = vi.fn();
vi.mock("@/themes/service", () => ({
  activateTheme: (...a: unknown[]) => activateTheme(...a),
  setCustomization: (...a: unknown[]) => setCustomization(...a),
  UnknownCustomizationKeyError: class extends Error {},
}));
const invalidateActiveTheme = vi.fn();
vi.mock("@/themes/active", () => ({ invalidateActiveTheme }));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { activateThemeAction, customizeThemeAction } = await import("./themes");

afterEach(() => {
  requireRole.mockReset();
  activateTheme.mockReset();
  setCustomization.mockReset();
  invalidateActiveTheme.mockReset();
  revalidatePath.mockReset();
});

function fd(o: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
}

describe("activateThemeAction", () => {
  it("requires admin+", async () => {
    requireRole.mockRejectedValue(new Error("forbidden"));
    const r = await activateThemeAction(
      undefined,
      fd({ themeId: "11111111-1111-1111-1111-111111111111" }),
    );
    expect(r.error).toMatch(/forbid|sign in/i);
  });

  it("activates, invalidates cache, revalidates root", async () => {
    requireRole.mockResolvedValue({});
    await activateThemeAction(undefined, fd({ themeId: "11111111-1111-1111-1111-111111111111" }));
    expect(activateTheme).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111");
    expect(invalidateActiveTheme).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});

describe("customizeThemeAction", () => {
  it("parses customizationJson field and forwards to setCustomization", async () => {
    requireRole.mockResolvedValue({});
    await customizeThemeAction(
      undefined,
      fd({
        themeId: "11111111-1111-1111-1111-111111111111",
        customizationJson: JSON.stringify({ primary: "#ff0000" }),
      }),
    );
    expect(setCustomization).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111", {
      primary: "#ff0000",
    });
  });

  it("rejects invalid JSON", async () => {
    requireRole.mockResolvedValue({});
    const r = await customizeThemeAction(
      undefined,
      fd({
        themeId: "11111111-1111-1111-1111-111111111111",
        customizationJson: "not json",
      }),
    );
    expect(r.error).toMatch(/invalid/i);
  });
});
