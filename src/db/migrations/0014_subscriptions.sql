CREATE TYPE "subscription_tier" AS ENUM ('essential', 'premium', 'enterprise');
--> statement-breakpoint
CREATE TYPE "subscription_status" AS ENUM ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "stripe_customer_id" text NOT NULL,
  "stripe_subscription_id" text NOT NULL,
  "tier" "subscription_tier" NOT NULL,
  "status" "subscription_status" NOT NULL,
  "current_period_end" timestamp with time zone,
  "cancel_at_period_end" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_user_unique" ON "subscriptions" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_customer_idx" ON "subscriptions" ("stripe_customer_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_stripe_sub_unique" ON "subscriptions" ("stripe_subscription_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions" ("status");
