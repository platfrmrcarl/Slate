import path from "node:path";

/**
 * Dynamically import a plugin-local module by absolute path. Extracted into
 * its own file so tests can swap it for a mock — the runtime `import()` is
 * not friendly to vi.mock.
 *
 * The resolved path is asserted to stay within `rootPath` so a malformed
 * manifest can't reach files outside the plugin directory via `..` segments
 * or absolute paths. Throws on traversal attempts.
 */
export class PluginPathTraversalError extends Error {
  constructor(rootPath: string, relativePath: string) {
    super(`plugin path escapes root: ${relativePath} (root: ${rootPath})`);
    this.name = "PluginPathTraversalError";
  }
}

export async function loadModule(rootPath: string, relativePath: string): Promise<unknown> {
  const absRoot = path.resolve(rootPath);
  const abs = path.resolve(absRoot, relativePath);
  // Normalize both ends with a trailing separator so /foo/barbaz isn't
  // accepted when root is /foo/bar.
  const rootWithSep = absRoot.endsWith(path.sep) ? absRoot : absRoot + path.sep;
  if (abs !== absRoot && !abs.startsWith(rootWithSep)) {
    throw new PluginPathTraversalError(rootPath, relativePath);
  }
  return import(abs);
}
