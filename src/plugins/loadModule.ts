import path from "node:path";

/**
 * Dynamically import a plugin-local module by absolute path. Extracted into
 * its own file so tests can swap it for a mock — the runtime `import()` is
 * not friendly to vi.mock.
 */
export async function loadModule(rootPath: string, relativePath: string): Promise<unknown> {
  const abs = path.resolve(rootPath, relativePath);
  return import(abs);
}
