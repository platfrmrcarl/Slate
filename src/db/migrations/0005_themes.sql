CREATE TABLE "active_theme" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"theme_id" uuid NOT NULL,
	"customization" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"source_url" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "themes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "active_theme" ADD CONSTRAINT "active_theme_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "active_theme" ADD CONSTRAINT active_theme_singleton CHECK (id = 1);