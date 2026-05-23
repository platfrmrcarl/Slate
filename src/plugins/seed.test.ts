import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as SeedModule from "./seed";

const discoverAllPlugins = vi.fn();
const upsertPlugin = vi.fn();

vi.mock("./registry", () => ({
  discoverAllPlugins: (...a: unknown[]) => discoverAllPlugins(...a),
}));
vi.mock("./service", () => ({
  upsertPlugin: (...a: unknown[]) => upsertPlugin(...a),
}));
vi.mock("@/lib/logger", () => ({
  logger: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined }),
}));

// Re-import seed.ts fresh per test so the module-level cached promise resets.
async function importSeedFresh(): Promise<typeof SeedModule> {
  vi.resetModules();
  return await import("./seed");
}

beforeEach(() => {
  discoverAllPlugins.mockReset();
  upsertPlugin.mockReset();
});

afterEach(() => vi.clearAllMocks());

describe("ensurePluginsSeeded", () => {
  it("upserts each discovered plugin manifest", async () => {
    discoverAllPlugins.mockResolvedValue([
      { manifest: { slug: "a", name: "A", version: "1.0.0" } },
      { manifest: { slug: "b", name: "B", version: "1.0.0" } },
    ]);
    upsertPlugin.mockResolvedValue({});
    const { ensurePluginsSeeded } = await importSeedFresh();
    await ensurePluginsSeeded();
    expect(upsertPlugin).toHaveBeenCalledTimes(2);
  });

  it("memoizes — concurrent + sequential calls run discovery only once", async () => {
    discoverAllPlugins.mockResolvedValue([]);
    const { ensurePluginsSeeded } = await importSeedFresh();
    await Promise.all([ensurePluginsSeeded(), ensurePluginsSeeded()]);
    await ensurePluginsSeeded();
    expect(discoverAllPlugins).toHaveBeenCalledTimes(1);
  });

  it("swallows per-plugin upsert errors without throwing", async () => {
    discoverAllPlugins.mockResolvedValue([{ manifest: { slug: "bad", name: "X", version: "1" } }]);
    upsertPlugin.mockRejectedValue(new Error("boom"));
    const { ensurePluginsSeeded } = await importSeedFresh();
    await expect(ensurePluginsSeeded()).resolves.toBeUndefined();
  });

  it("returns silently when discovery itself fails", async () => {
    discoverAllPlugins.mockRejectedValue(new Error("fs"));
    const { ensurePluginsSeeded } = await importSeedFresh();
    await expect(ensurePluginsSeeded()).resolves.toBeUndefined();
    expect(upsertPlugin).not.toHaveBeenCalled();
  });
});
