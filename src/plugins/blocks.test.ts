import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const register = vi.fn();
vi.mock("@/blocks/registry", () => ({ blockRegistry: { register, has: () => false } }));
const discoverAllPlugins = vi.fn();
vi.mock("./registry", () => ({ discoverAllPlugins: () => discoverAllPlugins() }));

const importPath = vi.fn();
vi.mock("./loadModule", () => ({ loadModule: (...a: unknown[]) => importPath(...a) }));

const { loadPluginBlocks, _resetPluginBlocksForTests } = await import("./blocks");

beforeEach(() => {
  _resetPluginBlocksForTests();
});

afterEach(() => {
  register.mockReset();
  discoverAllPlugins.mockReset();
  importPath.mockReset();
});

describe("loadPluginBlocks", () => {
  it("loads each declared block module and registers it", async () => {
    discoverAllPlugins.mockResolvedValue([
      {
        manifest: { slug: "p", blocks: ["./pricing.js"] },
        rootPath: "/repo/plugins/p",
        sourceKind: "local",
      },
    ]);
    importPath.mockResolvedValue({
      default: { type: "custom:pricing", schema: {}, render: () => null },
    });
    await loadPluginBlocks();
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ type: "custom:pricing" }));
  });

  it("skips plugins without blocks", async () => {
    discoverAllPlugins.mockResolvedValue([
      {
        manifest: { slug: "no-blocks" },
        rootPath: "/x",
        sourceKind: "local",
      },
    ]);
    await loadPluginBlocks();
    expect(register).not.toHaveBeenCalled();
  });

  it("logs and continues when a block module fails to load", async () => {
    discoverAllPlugins.mockResolvedValue([
      {
        manifest: { slug: "p", blocks: ["./broken.js"] },
        rootPath: "/x",
        sourceKind: "local",
      },
    ]);
    importPath.mockRejectedValue(new Error("not found"));
    await expect(loadPluginBlocks()).resolves.not.toThrow();
    expect(register).not.toHaveBeenCalled();
  });
});
