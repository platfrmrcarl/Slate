import { afterAll, describe, expect, it } from "vitest";
import { db, closeDb } from "@/db";
import { adminTokens, users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { issueAdminToken, verifyAdminToken, revokeAdminToken } from "./admin-token";

const HAS_DB = !!process.env.DATABASE_URL;
const cleanup: string[] = [];

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of cleanup)
    await db()
      .delete(users)
      .where(sql`${users.id} = ${id}`);
  await closeDb();
});

describe.runIf(HAS_DB)("admin-token", () => {
  it("issueAdminToken returns a token string; only the hash is stored", async () => {
    const [u] = await db()
      .insert(users)
      .values({ email: `at-${Date.now()}@e.com`, displayName: "AT", role: "admin" })
      .returning();
    cleanup.push(u!.id);
    const { token } = await issueAdminToken({ userId: u!.id, label: "CLI", scopes: ["cli"] });
    expect(token).toMatch(/^slate_/);
    const rows = await db()
      .select()
      .from(adminTokens)
      .where(sql`${adminTokens.userId} = ${u!.id}`);
    expect(rows[0]?.tokenHash).not.toBe(token);
    expect(rows[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifyAdminToken returns the user for a fresh token", async () => {
    const [u] = await db()
      .insert(users)
      .values({ email: `v-${Date.now()}@e.com`, displayName: "V", role: "admin" })
      .returning();
    cleanup.push(u!.id);
    const { token } = await issueAdminToken({ userId: u!.id, label: "x", scopes: ["cli"] });
    const result = await verifyAdminToken(token);
    expect(result?.id).toBe(u!.id);
  });

  it("verifyAdminToken returns null for unknown token", async () => {
    expect(await verifyAdminToken("slate_unknown")).toBeNull();
  });

  it("revokeAdminToken removes the row", async () => {
    const [u] = await db()
      .insert(users)
      .values({ email: `r-${Date.now()}@e.com`, displayName: "R", role: "admin" })
      .returning();
    cleanup.push(u!.id);
    const { token } = await issueAdminToken({ userId: u!.id, label: "x", scopes: ["cli"] });
    await revokeAdminToken(token);
    expect(await verifyAdminToken(token)).toBeNull();
  });
});
