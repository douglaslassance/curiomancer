ALTER TABLE "subscription" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "subscription" ADD COLUMN "current_period_end" timestamp;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id");