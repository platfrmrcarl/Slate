import { logger } from "@/lib/logger";
import { registerTheme, activateTheme, getActiveThemeRow, getThemeBySlug } from "./service";
import defaultTheme from "../../themes/slate-default";

let promise: Promise<void> | null = null;

export function ensureDefaultThemeSeeded(): Promise<void> {
  if (!promise) promise = run();
  return promise;
}

async function run(): Promise<void> {
  // Tolerate DB unreachable at boot (e.g., Next.js build-phase prerender).
  // At real runtime the cache stays at "tried, no-op" until the next process
  // boot; that's fine because the row will already exist after the migration
  // job runs and getThemeBySlug from the request path will find it.
  try {
    const existing = await getThemeBySlug("slate-default");
    const themeRow = await registerTheme({
      manifest: defaultTheme.manifest,
      sourceUrl: "compose-time://slate-default",
    });
    const active = await getActiveThemeRow();
    if (!active) {
      await activateTheme(themeRow.id);
      logger().info({ themeId: themeRow.id }, "themes:activated slate-default at boot");
    } else if (!existing) {
      logger().info(
        { themeId: themeRow.id },
        "themes:registered slate-default (kept existing active theme)",
      );
    }
  } catch (err) {
    logger().warn({ err }, "themes:seed skipped (DB unreachable)");
  }
}
