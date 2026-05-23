import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { dataJobs, users } from "@/db/schema";
import {
  markImportCompleted,
  markImportFailed,
  updateImportProgress,
  ZERO_PROGRESS,
} from "./jobs";

const HAS_DB = !!process.env.DATABASE_URL;

const jobIds: string[] = [];
const userIds: string[] = [];

afterAll(async () => {
  if (!HAS_DB) return;
  for (const id of jobIds) {
    await db()
      .delete(dataJobs)
      .where(sql`${dataJobs.id} = ${id}`);
  }
  for (const id of userIds) {
    await db()
      .delete(users)
      .where(sql`${users.id} = ${id}`);
  }
  await closeDb();
});

async function freshUserId(): Promise<string> {
  const [u] = await db()
    .insert(users)
    .values({
      email: `import-jobs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`,
      displayName: "T",
    })
    .returning({ id: users.id });
  userIds.push(u!.id);
  return u!.id;
}

async function freshJobId(uploadedBy: string): Promise<string> {
  const [j] = await db()
    .insert(dataJobs)
    .values({
      kind: "import",
      source: "csv",
      bucket: "test",
      objectPath: "imports/x.csv",
      uploadedBy,
    })
    .returning({ id: dataJobs.id });
  jobIds.push(j!.id);
  return j!.id;
}

describe.runIf(HAS_DB)("import jobs", () => {
  it("updateImportProgress sets status=running and persists progress JSONB", async () => {
    const userId = await freshUserId();
    const id = await freshJobId(userId);
    const progress = { ...ZERO_PROGRESS, processed: 12, posts: 10 };
    await updateImportProgress(id, progress);
    const rows = await db()
      .select()
      .from(dataJobs)
      .where(sql`${dataJobs.id} = ${id}`);
    expect(rows[0]?.status).toBe("running");
    expect(rows[0]?.progress).toMatchObject({ processed: 12, posts: 10 });
    expect(rows[0]?.startedAt).toBeInstanceOf(Date);
  });

  it("markImportCompleted writes status=completed + result + completedAt", async () => {
    const userId = await freshUserId();
    const id = await freshJobId(userId);
    await markImportCompleted(id, { ok: true, summary: "done" });
    const rows = await db()
      .select()
      .from(dataJobs)
      .where(sql`${dataJobs.id} = ${id}`);
    expect(rows[0]?.status).toBe("completed");
    expect(rows[0]?.result).toEqual({ ok: true, summary: "done" });
    expect(rows[0]?.completedAt).toBeInstanceOf(Date);
  });

  it("markImportFailed writes status=failed + truncated error message", async () => {
    const userId = await freshUserId();
    const id = await freshJobId(userId);
    const long = "x".repeat(5000);
    await markImportFailed(id, long);
    const rows = await db()
      .select()
      .from(dataJobs)
      .where(sql`${dataJobs.id} = ${id}`);
    expect(rows[0]?.status).toBe("failed");
    expect(rows[0]?.errorMessage?.length).toBe(4000);
  });
});
