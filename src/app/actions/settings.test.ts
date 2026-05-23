import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const can = vi.fn();
vi.mock("@/auth/context", () => ({
  requireUser: () => requireUser(),
  AuthRequiredError: class extends Error {},
  PermissionDeniedError: class extends Error {},
}));
vi.mock("@/auth/permissions", () => ({ can: (...a: unknown[]) => can(...a) }));

const upsertSetting = vi.fn();
vi.mock("@/lib/settings", () => ({
  upsertSetting: (...a: unknown[]) => upsertSetting(...a),
}));

const getI18nSettings = vi.fn();
const setI18nSettings = vi.fn();
const invalidateI18nSettings = vi.fn();
vi.mock("@/i18n/settings", () => ({
  getI18nSettings: () => getI18nSettings(),
  setI18nSettings: (...a: unknown[]) => setI18nSettings(...a),
  invalidateI18nSettings: () => invalidateI18nSettings(),
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

const { saveGeneralSettingsAction } = await import("./settings");

beforeEach(() => {
  requireUser.mockReset();
  can.mockReset();
  upsertSetting.mockReset();
  getI18nSettings.mockReset();
  setI18nSettings.mockReset();
  invalidateI18nSettings.mockReset();
  revalidatePath.mockReset();
});

afterEach(() => vi.restoreAllMocks());

function fd(o: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
}

describe("saveGeneralSettingsAction", () => {
  it("persists settings when admin submits valid form", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "admin" });
    can.mockReturnValue(true);
    getI18nSettings.mockResolvedValue({
      defaultLocale: "en",
      enabledLocales: ["en", "fr"],
      hideDefaultPrefix: true,
    });
    const r = await saveGeneralSettingsAction(
      undefined,
      fd({
        siteTitle: "My Site",
        siteTagline: "A great place",
        defaultLocale: "fr",
        postsPerPage: "20",
        seoDescription: "SEO desc",
      }),
    );
    expect(r.ok).toBe(true);
    expect(upsertSetting).toHaveBeenCalledWith("site.title", "My Site");
    expect(upsertSetting).toHaveBeenCalledWith("site.tagline", "A great place");
    expect(upsertSetting).toHaveBeenCalledWith("site.defaultLocale", "fr");
    expect(upsertSetting).toHaveBeenCalledWith("site.seoDescription", "SEO desc");
    expect(upsertSetting).toHaveBeenCalledWith("reading.postsPerPage", 20);
    expect(setI18nSettings).toHaveBeenCalledWith(
      expect.objectContaining({ defaultLocale: "fr", enabledLocales: ["en", "fr"] }),
    );
  });

  it("forbids when actor lacks manage:settings", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "editor" });
    can.mockReturnValue(false);
    const r = await saveGeneralSettingsAction(
      undefined,
      fd({
        siteTitle: "x",
        defaultLocale: "en",
        postsPerPage: "10",
      }),
    );
    expect(r.error).toMatch(/forbidden/i);
    expect(upsertSetting).not.toHaveBeenCalled();
  });

  it("rejects defaultLocale not in enabledLocales", async () => {
    requireUser.mockResolvedValue({ id: "u-1", role: "admin" });
    can.mockReturnValue(true);
    getI18nSettings.mockResolvedValue({
      defaultLocale: "en",
      enabledLocales: ["en"],
      hideDefaultPrefix: true,
    });
    const r = await saveGeneralSettingsAction(
      undefined,
      fd({
        siteTitle: "x",
        defaultLocale: "fr",
        postsPerPage: "10",
      }),
    );
    expect(r.fieldErrors?.defaultLocale).toBeTruthy();
    expect(upsertSetting).not.toHaveBeenCalled();
  });
});
