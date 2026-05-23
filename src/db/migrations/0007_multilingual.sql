-- Add translation_of column on pages (posts already has it from 0004_posts).
ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "translation_of" uuid;
--> statement-breakpoint

-- Tighten the translation_of self-reference. Earlier migrations declared the
-- column but did not add the explicit FK (Drizzle's self-FK omission). This
-- migration backfills the constraint for both pages and posts.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pages_translation_of_fk'
  ) THEN
    ALTER TABLE "pages"
      ADD CONSTRAINT "pages_translation_of_fk"
      FOREIGN KEY ("translation_of") REFERENCES "pages"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posts_translation_of_fk'
  ) THEN
    ALTER TABLE "posts"
      ADD CONSTRAINT "posts_translation_of_fk"
      FOREIGN KEY ("translation_of") REFERENCES "posts"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "pages_translation_of_idx" ON "pages" ("translation_of");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_translation_of_idx" ON "posts" ("translation_of");
