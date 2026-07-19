CREATE TABLE "tune_skip" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"place_id" text,
	"external_id" text,
	"count" integer DEFAULT 1 NOT NULL,
	"last_skipped_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tune_skip" ADD CONSTRAINT "tune_skip_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tune_skip" ADD CONSTRAINT "tune_skip_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tune_skip_user_idx" ON "tune_skip" USING btree ("user_id");