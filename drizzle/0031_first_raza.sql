ALTER TABLE "invite" ADD COLUMN "invited_email" text;--> statement-breakpoint
-- Backfill the recipient for existing waitlist-minted invites from the waitlist
-- entry that points at them, so the admin ledger shows who they were for.
UPDATE "invite" SET "invited_email" = w."email"
FROM "waitlist" w
WHERE w."invite_id" = "invite"."id" AND "invite"."invited_email" IS NULL;
