import { discoverAllPlugins } from "./registry";
import { upsertPlugin } from "./service";
import { logger } from "@/lib/logger";

let promise: Promise<void> | null = null;

/**
 * Idempotent boot-time plugin seeder. Discovers local + npm plugins,
 * upserts each manifest into the `plugins` table. Errors per plugin are
 * logged and swallowed so a single bad plugin can't take down boot.
 */
export function ensurePluginsSeeded(): Promise<void> {
  if (!promise) promise = run();
  return promise;
}

async function run() {
  let discovered: Awaited<ReturnType<typeof discoverAllPlugins>> = [];
  try {
    discovered = await discoverAllPlugins();
  } catch (err) {
    logger().warn({ err }, "plugins:discover-failed");
    return;
  }
  for (const p of discovered) {
    try {
      await upsertPlugin(p.manifest);
    } catch (err) {
      logger().warn({ err, slug: p.manifest.slug }, "plugin upsert failed");
    }
  }
  logger().info({ count: discovered.length }, "plugins:seeded");
}
