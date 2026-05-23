import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { dataJobs } from "@/db/schema";

export interface ImportProgress {
  total?: number;
  processed: number;
  users: number;
  posts: number;
  pages: number;
  media: number;
  taxonomies: number;
  comments: number;
  errors: number;
}

export const ZERO_PROGRESS: ImportProgress = {
  processed: 0,
  users: 0,
  posts: 0,
  pages: 0,
  media: 0,
  taxonomies: 0,
  comments: 0,
  errors: 0,
};

export async function updateImportProgress(id: string, progress: ImportProgress): Promise<void> {
  await db()
    .update(dataJobs)
    .set({
      progress,
      status: "running",
      startedAt: sql`coalesce(${dataJobs.startedAt}, now())`,
    })
    .where(eq(dataJobs.id, id));
}

export async function markImportCompleted(id: string, summary: unknown): Promise<void> {
  await db()
    .update(dataJobs)
    .set({ status: "completed", completedAt: sql`now()`, result: summary as object })
    .where(eq(dataJobs.id, id));
}

export async function markImportFailed(id: string, message: string): Promise<void> {
  await db()
    .update(dataJobs)
    .set({ status: "failed", completedAt: sql`now()`, errorMessage: message.slice(0, 4000) })
    .where(eq(dataJobs.id, id));
}
