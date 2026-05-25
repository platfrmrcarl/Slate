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
    userIds.push(u.user.id);
    expect(u.user.email).toBe(email);
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
    userIds.push(first.user.id);
    const second = await upsertOAuthUser({
      provider: "google",
      providerAccountId,
      email,
      displayName: "G",
    });
    expect(second.user.id).toBe(first.user.id);
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
    expect(linked.user.id).toBe(existing!.id);
    const links = await db()
      .select()
      .from(oauthAccounts)
      .where(sql`${oauthAccounts.userId} = ${existing!.id}`);
    expect(links).toHaveLength(1);
    expect(links[0]!.provider).toBe("github");
  });
});

describe.runIf(HAS_DB)("upsertOAuthUser isNew flag", () => {
  it("returns isNew=true for a brand-new user", async () => {
    const email = `oauth-isnew-${Date.now()}@example.com`;
    const result = await upsertOAuthUser({
      provider: "google",
      providerAccountId: `g-isnew-${Date.now()}`,
      email,
      displayName: "N",
    });
    userIds.push(result.user.id);
    expect(result.isNew).toBe(true);
  });

  it("returns isNew=false when the oauth link already exists", async () => {
    const email = `oauth-link-${Date.now()}@example.com`;
    const providerAccountId = `g-link-${Date.now()}`;
    const first = await upsertOAuthUser({
      provider: "google",
      providerAccountId,
      email,
      displayName: "L",
    });
    userIds.push(first.user.id);
    const second = await upsertOAuthUser({
      provider: "google",
      providerAccountId,
      email,
      displayName: "L",
    });
    expect(second.isNew).toBe(false);
    expect(second.user.id).toBe(first.user.id);
  });

  it("returns isNew=false when linking to an existing-by-email user", async () => {
    const email = `oauth-byemail-${Date.now()}@example.com`;
    const [pre] = await db()
      .insert(users)
      .values({ email, displayName: "P", role: "subscriber" })
      .returning();
    userIds.push(pre!.id);
    const result = await upsertOAuthUser({
      provider: "google",
      providerAccountId: `g-byemail-${Date.now()}`,
      email,
      displayName: "P",
    });
    expect(result.isNew).toBe(false);
    expect(result.user.id).toBe(pre!.id);
  });
});
