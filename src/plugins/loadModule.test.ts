import { describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { loadModule, PluginPathTraversalError } from "./loadModule";

async function tempRoot(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "slate-plugin-test-"));
  return dir;
}

describe("loadModule", () => {
  it("rejects relative paths that escape root via ..", async () => {
    const root = await tempRoot();
    await expect(loadModule(root, "../outside.js")).rejects.toBeInstanceOf(
      PluginPathTraversalError,
    );
  });

  it("rejects deep traversal that escapes root", async () => {
    const root = await tempRoot();
    await expect(loadModule(root, "../../../etc/passwd")).rejects.toBeInstanceOf(
      PluginPathTraversalError,
    );
  });

  it("rejects an absolute path that points outside root", async () => {
    const root = await tempRoot();
    await expect(loadModule(root, "/etc/passwd")).rejects.toBeInstanceOf(
      PluginPathTraversalError,
    );
  });

  it("rejects a sibling whose path-prefix matches root", async () => {
    // root = /tmp/foo, attacker passes ../foobar/x.js — both resolve to /tmp/foobar
    const base = await tempRoot();
    const root = path.join(base, "foo");
    await fs.mkdir(root);
    await expect(loadModule(root, "../foobar/x.js")).rejects.toBeInstanceOf(
      PluginPathTraversalError,
    );
  });

  it("loads a module inside root", async () => {
    const root = await tempRoot();
    const file = path.join(root, "ok.mjs");
    await fs.writeFile(file, "export const sentinel = 42;");
    const mod = (await loadModule(root, "./ok.mjs")) as { sentinel: number };
    expect(mod.sentinel).toBe(42);
  });
});
