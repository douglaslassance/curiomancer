DROP INDEX "place_name_city_idx";--> statement-breakpoint
ALTER TABLE "place" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "place" ADD COLUMN "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "place_source_external_idx" ON "place" USING btree ("source","external_id") WHERE "place"."external_id" IS NOT NULL;