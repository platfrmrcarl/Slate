ALTER TABLE "import_jobs" RENAME TO "data_jobs";
--> statement-breakpoint
ALTER TABLE "data_jobs" RENAME CONSTRAINT "import_jobs_uploaded_by_users_id_fk" TO "data_jobs_uploaded_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "data_jobs" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'import' NOT NULL;
