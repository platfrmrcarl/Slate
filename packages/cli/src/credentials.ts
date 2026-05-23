import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface Credentials {
  url: string;
  token: string;
}

function configHome(): string {
  return process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
}

export async function credentialsPath(): Promise<string> {
  return path.join(configHome(), "slate", "credentials.json");
}

export async function saveCredentials(creds: Credentials): Promise<void> {
  const file = await credentialsPath();
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.writeFile(file, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export async function loadCredentials(): Promise<Credentials | null> {
  try {
    const raw = await fs.readFile(await credentialsPath(), "utf8");
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}

export async function clearCredentials(): Promise<void> {
  await fs.rm(await credentialsPath(), { force: true });
}
