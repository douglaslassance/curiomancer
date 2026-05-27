ALTER TABLE "like" RENAME TO "place_relation";--> statement-breakpoint
ALTER TABLE "place_relation" DROP CONSTRAINT "like_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "place_relation" DROP CONSTRAINT "like_place_id_place_id_fk";
--> statement-breakpoint
DROP INDEX "like_user_place_idx";--> statement-breakpoint
ALTER TABLE "place_relation" ADD COLUMN "kind" text DEFAULT 'liked' NOT NULL;--> statement-breakpoint
ALTER TABLE "place_relation" ADD CONSTRAINT "place_relation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_relation" ADD CONSTRAINT "place_relation_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "place_relation_user_place_idx" ON "place_relation" USING btree ("user_id","place_id");