import { afterAll, describe, expect, it, vi } from "vitest";
import { db, closeDb } from "@/db";
import { users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { issuePasswordReset, consumePasswordReset } from "./password-reset";

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

describe.runIf(HAS_DB)("password reset", () => {
  it("issuePasswordReset emails a link with a 40-char token", async () => {
    const [u] = await db()
      .insert(users)
      .values({
        email: `pr-${Date.now()}@e.com`,
        displayName: "PR",
        role: "subscriber",
        passwordHash: null,
      })
      .returning();
    uids.push(u!.id);
    sendEmail.mockClear();
    await issuePasswordReset(u!.email);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const callArg = sendEmail.mock.calls[0]![0];
    expect(callArg.to).toBe(u!.email);
    expect(callArg.react).toBeTruthy();
  });

  it("issuePasswordReset is a no-op for unknown emails (no enumeration)", async () => {
    sendEmail.mockClear();
    await issuePasswordReset(`absent-${Date.now()}@e.com`);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("consumePasswordReset updates the hash + invalidates other sessions", async () => {
    const [u] = await db()
      .insert(users)
      .values({
        email: `cp-${Date.now()}@e.com`,
        displayName: "CP",
        role: "subscriber",
        passwordHash: null,
      })
      .returning();
    uids.push(u!.id);
    await issuePasswordReset(u!.email);
    const token = (sendEmail.mock.calls.at(-1)![0].react.props.resetUrl as string).match(
      /token=([a-z2-7]{40})/,
    )![1]!;

    const result = await consumePasswordReset(token, "correct horse battery 2");
    expect(result.kind).toBe("ok");
    const fresh = await db()
      .select()
      .from(users)
      .where(sql`${users.id} = ${u!.id}`);
    expect(fresh[0]!.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it("consumePasswordReset rejects a used token on second attempt", async () => {
    const [u] = await db()
      .insert(users)
      .values({
        email: `rs-${Date.now()}@e.com`,
        displayName: "RS",
        role: "subscriber",
      })
      .returning();
    uids.push(u!.id);
    await issuePasswordReset(u!.email);
    const token = (sendEmail.mock.calls.at(-1)![0].react.props.resetUrl as string).match(
      /token=([a-z2-7]{40})/,
    )![1]!;
    const first = await consumePasswordReset(token, "correct horse battery 2");
    expect(first.kind).toBe("ok");
    const second = await consumePasswordReset(token, "correct horse battery 3");
    expect(second.kind).toBe("error");
  });

  it("consumePasswordReset rejects unknown token", async () => {
    expect((await consumePasswordReset("a".repeat(40), "correct horse battery 2")).kind).toBe(
      "error",
    );
  });
});
