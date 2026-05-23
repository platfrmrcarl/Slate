CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" text NOT NULL,
	"object_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"original_filename" text NOT NULL,
	"width" integer,
	"height" integer,
	"size_bytes" integer NOT NULL,
	"alt_text" text,
	"caption" text,
	"folder" text DEFAULT '/' NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"probe_status" text DEFAULT 'pending' NOT NULL,
	"probed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_bucket_object_unique" ON "media" USING btree ("bucket","object_path");--> statement-breakpoint
CREATE INDEX "media_mime_idx" ON "media" USING btree ("mime_type");--> statement-breakpoint
CREATE INDEX "media_folder_idx" ON "media" USING btree ("folder");--> statement-breakpoint
CREATE INDEX "media_uploaded_by_idx" ON "media" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "media_created_idx" ON "media" USING btree ("created_at");