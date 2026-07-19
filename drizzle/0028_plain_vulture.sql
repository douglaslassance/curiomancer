ALTER TABLE "invite" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Backfill: existing invites keep their current owner (creator == owner until now).
UPDATE "invite" SET "owner_id" = "created_by_user_id" WHERE "owner_id" IS NULL;