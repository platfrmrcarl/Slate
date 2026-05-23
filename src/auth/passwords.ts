import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";

// `Algorithm` from @node-rs/argon2 is a `const enum`, which TypeScript's
// `isolatedModules` setting forbids importing. Inline the numeric value
// (Algorithm.Argon2id === 2) instead.
const ARGON2ID = 2 as const;

const ARGON_OPTS = {
  algorithm: ARGON2ID,
  memoryCost: 19456, // 19 MiB — OWASP 2024 baseline
  timeCost: 2,
  parallelism: 1,
} as const;

const MIN_LEN = 12;
const MAX_LEN = 256;

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < MIN_LEN) throw new Error(`password must be at least ${MIN_LEN} characters`);
  if (plain.length > MAX_LEN) throw new Error(`password must be at most ${MAX_LEN} characters`);
  return argonHash(plain, ARGON_OPTS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  if (!hash || !plain) return false;
  if (!hash.startsWith("$argon2id$")) return false;
  if (plain.length > MAX_LEN) return false;
  try {
    return await argonVerify(hash, plain);
  } catch {
    return false;
  }
}
