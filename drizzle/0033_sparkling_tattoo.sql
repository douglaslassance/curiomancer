ALTER TABLE "api_token" ADD COLUMN "kind" text DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_token" ADD COLUMN "device_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "api_token_user_device_idx" ON "api_token" USING btree ("user_id","device_id") WHERE "api_token"."device_id" IS NOT NULL;