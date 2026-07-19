ALTER TABLE "invite" DROP CONSTRAINT "invite_owner_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "invite_limit" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "invite" DROP COLUMN "owner_id";