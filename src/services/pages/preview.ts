import { SignJWT, jwtVerify } from "jose";

const ISSUER = "wpk-preview";

function secret(): Uint8Array {
  const s = process.env.PREVIEW_TOKEN_SECRET;
  if (!s) throw new Error("PREVIEW_TOKEN_SECRET is required");
  return new TextEncoder().encode(s);
}

export interface PreviewClaim {
  pageId: string;
}

export async function issuePreviewToken(
  pageId: string,
  opts: { ttlSec?: number } = {},
): Promise<string> {
  const ttl = opts.ttlSec ?? 5 * 60;
  const jwt = new SignJWT({ pageId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttl);
  return await jwt.sign(secret());
}

export async function verifyPreviewToken(token: string): Promise<PreviewClaim> {
  const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER });
  if (typeof payload.pageId !== "string") throw new Error("invalid claims");
  return { pageId: payload.pageId };
}
