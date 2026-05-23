import { loadCredentials } from "./credentials";

export type TransportKind = "local" | "remote";

export interface TransportOpts {
  url?: string;
  token?: string;
}

export function resolveTransport(opts: TransportOpts): TransportKind {
  if (opts.url || process.env.WPK_URL) return "remote";
  if (process.env.DATABASE_URL) return "local";
  return "remote";
}

async function resolveCreds(opts: TransportOpts): Promise<{ url: string; token: string }> {
  if (opts.url && opts.token) return { url: opts.url, token: opts.token };
  if (opts.url) {
    const stored = await loadCredentials();
    if (stored && stored.url === opts.url) return { url: opts.url, token: stored.token };
  }
  const env = process.env.WPK_URL;
  const tok = process.env.WPK_TOKEN;
  if (env && tok) return { url: env, token: tok };
  const stored = await loadCredentials();
  if (stored) return stored;
  throw new Error(
    "No remote credentials. Run `wpkiller login --url https://your-install` or set WPK_URL + WPK_TOKEN.",
  );
}

export async function remoteRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  opts: TransportOpts = {},
): Promise<T> {
  const creds = await resolveCreds(opts);
  const url = creds.url.replace(/\/$/, "") + path;
  const init: RequestInit = {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${creds.token}`,
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`request failed (${res.status}): ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function localRun<T>(fn: () => Promise<T>): Promise<T> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for local CLI usage.");
  }
  return await fn();
}
