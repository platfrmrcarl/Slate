import { timingSafeEqual } from "node:crypto";

/**
 * Returns true when the incoming job request carries the expected
 * `Authorization: Bearer ${INTERNAL_JOB_SECRET}` header. Uses a
 * constant-time comparison so an attacker can't extract the secret
 * via response-time analysis.
 */
export async function authorizeJobRequest(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization");
  if (!auth) return false;
  const expected = `Bearer ${process.env.INTERNAL_JOB_SECRET ?? ""}`;
  return constantTimeEqual(auth, expected);
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Still do a fixed-cost compare to avoid leaking the length.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}
