import { discoverAllPlugins } from "./registry";
import { blockRegistry } from "@/blocks/registry";
import { logger } from "@/lib/logger";
import { loadModule } from "./loadModule";

let loaded = false;
let promise: Promise<void> | null = null;

/**
 * Boot-time plugin block loader. Iterates over every discovered plugin and
 * dynamically imports each declared block module, registering the exported
 * definition with the runtime `blockRegistry`. Idempotent; safe to call
 * multiple times.
 */
export function loadPluginBlocks(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (!promise) promise = run();
  return promise;
}

async function run() {
  const plugins = await discoverAllPlugins();
  for (const p of plugins) {
    const blocks = p.manifest.blocks ?? [];
    for (const rel of blocks) {
      try {
        const mod = (await loadModule(p.rootPath, rel)) as {
          default?: { type?: string } | undefined;
          type?: string;
        };
        const def = (mod.default ?? mod) as { type?: string } & Record<string, unknown>;
        if (typeof def?.type !== "string") {
          logger().warn({ slug: p.manifest.slug, rel }, "plugin-blocks:missing-type");
          continue;
        }
        if (!blockRegistry.has(def.type)) {
          blockRegistry.register(def as { type: string } & Record<string, unknown>);
        }
      } catch (err) {
        logger().warn({ err, slug: p.manifest.slug, rel }, "plugin-blocks:load-failed");
      }
    }
  }
  loaded = true;
}

/** Test-only: reset the memoized load state. */
export function _resetPluginBlocksForTests(): void {
  loaded = false;
  promise = null;
}
