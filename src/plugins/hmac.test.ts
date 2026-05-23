import { describe, expect, it } from "vitest";
import { signPayload, verifySignature, newWebhookSecret } from "./hmac";

describe("signPayload + verifySignature", () => {
  it("round-trips", () => {
    const secret = newWebhookSecret();
    const body = '{"event":"post.published"}';
    const ts = Math.floor(Date.now() / 1000);
    const sig = signPayload(secret, ts, body);
    expect(verifySignature(secret, ts, body, sig)).toBe(true);
  });

  it("rejects altered body", () => {
    const secret = newWebhookSecret();
    const ts = Math.floor(Date.now() / 1000);
    const sig = signPayload(secret, ts, "a");
    expect(verifySignature(secret, ts, "b", sig)).toBe(false);
  });

  it("rejects an old timestamp (replay)", () => {
    const secret = newWebhookSecret();
    const tsOld = Math.floor(Date.now() / 1000) - 60 * 60;
    const body = "x";
    const sig = signPayload(secret, tsOld, body);
    expect(verifySignature(secret, tsOld, body, sig, { maxAgeSec: 300 })).toBe(false);
  });
});

describe("newWebhookSecret", () => {
  it("returns 64 hex chars", () => {
    expect(newWebhookSecret()).toMatch(/^[0-9a-f]{64}$/);
  });
});
