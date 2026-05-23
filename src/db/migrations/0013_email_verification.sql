ALTER TABLE "magic_link_tokens" ADD COLUMN "purpose" text DEFAULT 'signin' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "magic_link_purpose_idx" ON "magic_link_tokens" ("purpose");
