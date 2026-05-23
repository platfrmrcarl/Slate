CREATE TYPE "public"."page_status" AS ENUM('draft', 'scheduled', 'published', 'archived', 'trash');--> statement-breakpoint
CREATE TABLE "page_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"title" text NOT NULL,
	"blocks" jsonb NOT NULL,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "page_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone,
	"locale" text DEFAULT 'en' NOT NULL,
	"author_id" uuid NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_revisions_page_idx" ON "page_revisions" USING btree ("page_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_slug_locale" ON "pages" USING btree ("slug","locale");--> statement-breakpoint
CREATE INDEX "pages_status_idx" ON "pages" USING btree ("status","published_at");
ALTER TABLE "pages"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(seo_description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(excerpt, '')), 'C')
  ) STORED;

CREATE INDEX "pages_search_idx" ON "pages" USING gin ("search_vector");
