DROP TABLE "follow" CASCADE;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "messageable" boolean DEFAULT true;