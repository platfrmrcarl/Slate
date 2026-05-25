import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const dir = path.join(os.tmpdir(), `slate-cred-${process.pid}-${Date.now()}`);
vi.stubEnv("XDG_CONFIG_HOME", dir);

const { saveCredentials, loadCredentials, clearCredentials, credentialsPath } =
  await import("./credentials");

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("credentials", () => {
  it("saves + loads token + URL", async () => {
    await saveCredentials({ url: "https://app.example.com", token: "sk-test" });
    const loaded = await loadCredentials();
    expect(loaded?.url).toBe("https://app.example.com");
    expect(loaded?.token).toBe("sk-test");
  });

  it("returns null when no file exists", async () => {
    expect(await loadCredentials()).toBeNull();
  });

  it("file is 0600", async () => {
    await saveCredentials({ url: "https://app.example.com", token: "t" });
    const stat = await fs.stat(await credentialsPath());
    expect((stat.mode & 0o777).toString(8)).toBe("600");
  });

  it("clearCredentials removes the file", async () => {
    await saveCredentials({ url: "https://x", token: "t" });
    await clearCredentials();
    expect(await loadCredentials()).toBeNull();
  });
});
