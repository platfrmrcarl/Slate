import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, db } from "@/db";
import { magicLinkTokens, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

const sendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/auth/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

vi.stubEnv("APP_URL", "https://app.test");

const { issueMagicLink, consumeMagicLink, MAGIC_LINK_TTL_MS } = await import("./magic-link");

const HAS_DB = !!process.env.DATABASE_URL;
const userIds: string[] = [];

beforeEach(() => sendEmail.mockClear());

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of userIds)
    await db()
      .delete(users)
      .where(sql`${users.id} = ${id}`);
  await closeDb();
});

describe.runIf(HAS_DB)("magic link", () => {
  it("issueMagicLink stores a hashed token and emails a URL", async () => {
    const email = `ml-${Date.now()}@example.com`;
    await issueMagicLink(email);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const args = sendEmail.mock.calls[0]![0] as { to: string; html: string };
    expect(args.to).toBe(email);
    expect(args.html).toContain("https://app.test/api/auth/magic-link/verify?token=");

    const rows = await db().select().from(magicLinkTokens).where(eq(magicLinkTokens.email, email));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.usedAt).toBeNull();
    expect(rows[0]!.expiresAt.getTime() - Date.now()).toBeGreaterThan(MAGIC_LINK_TTL_MS - 60_000);
  });

  it("consumeMagicLink creates a user if missing, returns it, and marks token used", async () => {
    const email = `ml2-${Date.now()}@example.com`;
    await issueMagicLink(email);
    const html = (sendEmail.mock.calls[0]![0] as { html: string }).html;
    const tokenMatch = html.match(/verify\?token=([a-z2-7]{40})/);
    expect(tokenMatch).not.toBeNull();
    const token = tokenMatch![1]!;

    const result = await consumeMagicLink(token);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      userIds.push(result.user.id);
      expect(result.user.email).toBe(email);
    }
  });

  it("consumeMagicLink rejects a reused token", async () => {
    const email = `ml3-${Date.now()}@example.com`;
    await issueMagicLink(email);
    const html = (sendEmail.mock.calls[0]![0] as { html: string }).html;
    const token = html.match(/verify\?token=([a-z2-7]{40})/)![1]!;
    const first = await consumeMagicLink(token);
    if (first.kind === "ok") userIds.push(first.user.id);
    const second = await consumeMagicLink(token);
    expect(second.kind).toBe("error");
  });

  it("consumeMagicLink rejects an unknown token", async () => {
    const result = await consumeMagicLink("a".repeat(40));
    expect(result.kind).toBe("error");
  });
});
