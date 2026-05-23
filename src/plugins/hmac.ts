import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Generate a fresh 256-bit webhook signing secret (hex-encoded).
 *
 * The secret is stored per-webhook in the `webhooks` table; rotating it
 * invalidates all previously-issued signatures.
 */
export function newWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Compute the HMAC-SHA256 signature for a webhook delivery.
 *
 * Canonical signing string: `"<timestamp>.<body>"`.
 * The timestamp (unix seconds) is included so receivers can reject stale
 * deliveries that an attacker has replayed.
 */
export function signPayload(secret: string, timestamp: number, body: string): string {
  const h = createHmac("sha256", secret);
  h.update(`${timestamp}.${body}`);
  return h.digest("hex");
}

export interface VerifyOptions {
  maxAgeSec?: number;
}

/**
 * Verify a webhook signature with a constant-time comparison and a
 * configurable freshness window (default 5 minutes).
 */
export function verifySignature(
  secret: string,
  timestamp: number,
  body: string,
  signature: string,
  opts: VerifyOptions = {},
): boolean {
  const maxAge = opts.maxAgeSec ?? 300;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > maxAge) return false;
  const expected = signPayload(secret, timestamp, body);
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}
