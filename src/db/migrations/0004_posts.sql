CREATE TYPE "public"."post_status" AS ENUM('draft', 'scheduled', 'published', 'archived', 'trash');--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid,
	"parent_id" uuid,
	"author_user_id" uuid,
	"author_name" text,
	"author_email" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"spam_score" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"blocks" jsonb NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_taxonomies" (
	"post_id" uuid NOT NULL,
	"taxonomy_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "post_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone,
	"locale" text DEFAULT 'en' NOT NULL,
	"translation_of" uuid,
	"author_id" uuid NOT NULL,
	"featured_media_id" uuid,
	"seo_title" text,
	"seo_description" text,
	"comments_enabled" text DEFAULT 'default' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taxonomies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_taxonomies" ADD CONSTRAINT "post_taxonomies_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_taxonomies" ADD CONSTRAINT "post_taxonomies_taxonomy_id_taxonomies_id_fk" FOREIGN KEY ("taxonomy_id") REFERENCES "public"."taxonomies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_post_idx" ON "comments" USING btree ("post_id","status");--> statement-breakpoint
CREATE INDEX "comments_status_idx" ON "comments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "post_revisions_post_idx" ON "post_revisions" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "post_tax_pk" ON "post_taxonomies" USING btree ("post_id","taxonomy_id");--> statement-breakpoint
CREATE INDEX "post_tax_tax_idx" ON "post_taxonomies" USING btree ("taxonomy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_slug_locale" ON "posts" USING btree ("slug","locale");--> statement-breakpoint
CREATE INDEX "posts_published_idx" ON "posts" USING btree ("published_at","status");--> statement-breakpoint
CREATE INDEX "posts_author_idx" ON "posts" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "posts_status_idx" ON "posts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomies_type_slug_unique" ON "taxonomies" USING btree ("type","slug");--> statement-breakpoint
CREATE INDEX "taxonomies_type_idx" ON "taxonomies" USING btree ("type");
ALTER TABLE "posts"
  ADD COLUMN "search_vector_tsv" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(excerpt, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(seo_description, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS "posts_search_idx" ON "posts" USING gin ("search_vector_tsv");
