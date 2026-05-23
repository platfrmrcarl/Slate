import { promises as fs } from "node:fs";
import path from "node:path";
import { pluginManifestSchema, type PluginManifest } from "./manifest";

export interface LoadedPlugin {
  manifest: PluginManifest;
  rootPath: string;
  sourceKind: "local" | "npm";
}

/**
 * Scan `<repo>/plugins/*` for manifest.json files. Silently skips entries
 * that don't have a valid manifest so a malformed plugin can't break boot.
 */
export async function discoverLocalPlugins(): Promise<LoadedPlugin[]> {
  const dir = path.resolve(process.cwd(), "plugins");
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: LoadedPlugin[] = [];
  for (const name of entries) {
    const root = path.join(dir, name);
    const stat = await fs.stat(root).catch(() => null);
    if (!stat?.isDirectory()) continue;
    const manifestPath = path.join(root, "manifest.json");
    let raw: string;
    try {
      raw = await fs.readFile(manifestPath, "utf8");
    } catch {
      continue;
    }
    try {
      const parsed = pluginManifestSchema.parse(JSON.parse(raw));
      out.push({ manifest: parsed, rootPath: root, sourceKind: "local" });
    } catch {
      continue;
    }
  }
  return out;
}

/**
 * Scan `node_modules/slate-plugin-*` for manifest.json files. Returns
 * an empty array when node_modules is unreadable or no matching packages
 * are installed.
 */
export async function discoverNpmPlugins(): Promise<LoadedPlugin[]> {
  const modulesDir = path.resolve(process.cwd(), "node_modules");
  let entries: string[] = [];
  try {
    entries = await fs.readdir(modulesDir);
  } catch {
    return [];
  }
  const out: LoadedPlugin[] = [];
  for (const name of entries) {
    if (!name.startsWith("slate-plugin-")) continue;
    const root = path.join(modulesDir, name);
    const manifestPath = path.join(root, "manifest.json");
    let raw: string;
    try {
      raw = await fs.readFile(manifestPath, "utf8");
    } catch {
      continue;
    }
    try {
      const parsed = pluginManifestSchema.parse(JSON.parse(raw));
      out.push({ manifest: parsed, rootPath: root, sourceKind: "npm" });
    } catch {
      continue;
    }
  }
  return out;
}

export async function discoverAllPlugins(): Promise<LoadedPlugin[]> {
  const [local, npm] = await Promise.all([discoverLocalPlugins(), discoverNpmPlugins()]);
  return [...local, ...npm];
}
