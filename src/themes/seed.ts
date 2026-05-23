import { logger } from "@/lib/logger";
import { registerTheme, activateTheme, getActiveThemeRow, getThemeBySlug } from "./service";
import defaultTheme from "../../themes/wpk-default";

let promise: Promise<void> | null = null;

export function ensureDefaultThemeSeeded(): Promise<void> {
  if (!promise) promise = run();
  return promise;
}

async function run(): Promise<void> {
  const existing = await getThemeBySlug("wpk-default");
  const themeRow = await registerTheme({
    manifest: defaultTheme.manifest,
    sourceUrl: "compose-time://wpk-default",
  });
  const active = await getActiveThemeRow();
  if (!active) {
    await activateTheme(themeRow.id);
    logger().info({ themeId: themeRow.id }, "themes:activated wpk-default at boot");
  } else if (!existing) {
    logger().info(
      { themeId: themeRow.id },
      "themes:registered wpk-default (kept existing active theme)",
    );
  }
}
