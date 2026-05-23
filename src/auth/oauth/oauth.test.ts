import { afterAll, describe, expect, it } from "vitest";
import { closeDb, db } from "@/db";
import { users, oauthAccounts } from "@/db/schema";
import { sql } from "drizzle-orm";
import { upsertOAuthUser } from ".";

const HAS_DB = !!process.env.DATABASE_URL;
const userIds: string[] = [];

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of userIds)
    await db()
      .delete(users)
      .where(sql`${users.id} = ${id}`);
  await closeDb();
});

describe.runIf(HAS_DB)("upsertOAuthUser", () => {
  it("creates a new user when neither link nor email match", async () => {
    const email = `oauth-new-${Date.now()}@example.com`;
    const u = await upsertOAuthUser({
      provider: "google",
      providerAccountId: `g-${Date.now()}`,
      email,
      displayName: "G",
    });
    userIds.push(u.id);
    expect(u.email).toBe(email);
  });

  it("returns the linked user on second sign-in", async () => {
    const providerAccountId = `g-link-${Date.now()}`;
    const email = `oauth-link-${Date.now()}@example.com`;
    const first = await upsertOAuthUser({
      provider: "google",
      providerAccountId,
      email,
      displayName: "G",
    });
    userIds.push(first.id);
    const second = await upsertOAuthUser({
      provider: "google",
      providerAccountId,
      email,
      displayName: "G",
    });
    expect(second.id).toBe(first.id);
  });

  it("links to an existing email-matching user", async () => {
    const email = `oauth-existing-${Date.now()}@example.com`;
    const [existing] = await db()
      .insert(users)
      .values({ email, displayName: "Existing" })
      .returning();
    userIds.push(existing!.id);

    const linked = await upsertOAuthUser({
      provider: "github",
      providerAccountId: `gh-${Date.now()}`,
      email,
      displayName: "GH",
    });
    expect(linked.id).toBe(existing!.id);
    const links = await db()
      .select()
      .from(oauthAccounts)
      .where(sql`${oauthAccounts.userId} = ${existing!.id}`);
    expect(links).toHaveLength(1);
    expect(links[0]!.provider).toBe("github");
  });
});
