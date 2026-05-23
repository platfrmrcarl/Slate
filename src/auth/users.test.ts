import { afterAll, describe, expect, it } from "vitest";
import { closeDb, db } from "@/db";
import { users } from "@/db/schema";
import { createUser, findUserByEmail, verifyCredentials, countOwners } from "./users";
import { sql } from "drizzle-orm";

const HAS_DB = !!process.env.DATABASE_URL;
const cleanup: string[] = [];

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of cleanup) {
    await db()
      .delete(users)
      .where(sql`${users.id} = ${id}`);
  }
  await closeDb();
});

describe.runIf(HAS_DB)("user orchestration", () => {
  it("createUser stores a hashed password and lowercased email", async () => {
    const u = await createUser({
      email: "  TestUser@Example.com  ",
      password: "correct horse battery",
      displayName: "Test User",
    });
    cleanup.push(u.id);
    expect(u.email).toBe("testuser@example.com");
    expect(u.passwordHash).not.toBeNull();
    expect(u.passwordHash!.startsWith("$argon2id$")).toBe(true);
  });

  it("createUser rejects duplicate email (case-insensitive)", async () => {
    const u = await createUser({
      email: `dup-${Date.now()}@example.com`,
      password: "correct horse battery",
      displayName: "Dup",
    });
    cleanup.push(u.id);
    await expect(
      createUser({
        email: u.email.toUpperCase(),
        password: "correct horse battery",
        displayName: "Dup2",
      }),
    ).rejects.toThrow(/already in use/i);
  });

  it("findUserByEmail is case-insensitive and trims", async () => {
    const email = `find-${Date.now()}@example.com`;
    const u = await createUser({ email, password: "correct horse battery", displayName: "F" });
    cleanup.push(u.id);
    expect((await findUserByEmail(` ${email.toUpperCase()} `))?.id).toBe(u.id);
  });

  it("verifyCredentials returns the user on correct password", async () => {
    const email = `v-${Date.now()}@example.com`;
    const u = await createUser({
      email,
      password: "correct horse battery",
      displayName: "V",
    });
    cleanup.push(u.id);
    expect((await verifyCredentials(email, "correct horse battery"))?.id).toBe(u.id);
  });

  it("verifyCredentials returns null on wrong password", async () => {
    const email = `w-${Date.now()}@example.com`;
    const u = await createUser({
      email,
      password: "correct horse battery",
      displayName: "W",
    });
    cleanup.push(u.id);
    expect(await verifyCredentials(email, "wrong wrong wrong")).toBeNull();
  });

  it("verifyCredentials returns null for OAuth-only users (no password)", async () => {
    const [u] = await db()
      .insert(users)
      .values({
        email: `oauth-${Date.now()}@example.com`,
        displayName: "OAuth",
        passwordHash: null,
      })
      .returning();
    cleanup.push(u!.id);
    expect(await verifyCredentials(u!.email, "anything anything")).toBeNull();
  });

  it("countOwners returns the number of owner-role users", async () => {
    const before = await countOwners();
    const [u] = await db()
      .insert(users)
      .values({
        email: `owner-${Date.now()}@example.com`,
        displayName: "O",
        role: "owner",
      })
      .returning();
    cleanup.push(u!.id);
    expect(await countOwners()).toBe(before + 1);
  });
});
