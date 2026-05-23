import { afterAll, describe, expect, it, vi } from "vitest";
import { db, closeDb } from "@/db";
import { magicLinkTokens, users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { issueEmailVerification, consumeEmailVerification } from "./email-verification";

const HAS_DB = !!process.env.DATABASE_URL;
const uids: string[] = [];

const sendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/auth/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

vi.stubEnv("APP_URL", "https://app.test");

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of uids)
    await db()
      .delete(users)
      .where(sql`${users.id} = ${id}`);
  await closeDb();
});

describe.runIf(HAS_DB)("email verification", () => {
  it("issueEmailVerification emails a 40-char token URL with purpose=verify", async () => {
    const [u] = await db()
      .insert(users)
      .values({ email: `ev-${Date.now()}@e.com`, displayName: "EV", role: "subscriber" })
      .returning();
    uids.push(u!.id);
    sendEmail.mockClear();
    await issueEmailVerification(u!.email);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const callArg = sendEmail.mock.calls[0]![0];
    expect(callArg.react.props.verifyUrl).toMatch(/\/verify-email\?token=[a-z2-7]{40}/);
    const rows = await db()
      .select()
      .from(magicLinkTokens)
      .where(sql`${magicLinkTokens.email} = ${u!.email}`);
    expect(rows[0]?.purpose).toBe("verify");
  });

  it("consumeEmailVerification marks emailVerifiedAt and the token as used", async () => {
    const [u] = await db()
      .insert(users)
      .values({ email: `cv-${Date.now()}@e.com`, displayName: "CV", role: "subscriber" })
      .returning();
    uids.push(u!.id);
    await issueEmailVerification(u!.email);
    const token = (sendEmail.mock.calls.at(-1)![0].react.props.verifyUrl as string).match(
      /token=([a-z2-7]{40})/,
    )![1]!;
    const result = await consumeEmailVerification(token);
    expect(result.kind).toBe("ok");
    const fresh = await db()
      .select()
      .from(users)
      .where(sql`${users.id} = ${u!.id}`);
    expect(fresh[0]!.emailVerifiedAt).not.toBeNull();
  });

  it("consumeEmailVerification rejects a signin-purpose token", async () => {
    // create a signin-purpose token directly
    const token = "a".repeat(40);
    await db()
      .insert(magicLinkTokens)
      .values({
        tokenHash: (await import("./tokens")).hashToken(token),
        email: "x@e.com",
        purpose: "signin",
        expiresAt: new Date(Date.now() + 60_000),
      });
    expect((await consumeEmailVerification(token)).kind).toBe("error");
    await db()
      .delete(magicLinkTokens)
      .where(sql`${magicLinkTokens.email} = 'x@e.com'`);
  });
});
