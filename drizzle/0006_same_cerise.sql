CREATE TABLE "follow" (
	"follower_id" text NOT NULL,
	"followed_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "follow_follower_id_followed_id_pk" PRIMARY KEY("follower_id","followed_id"),
	CONSTRAINT "follow_no_self" CHECK ("follow"."follower_id" <> "follow"."followed_id")
);
--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_follower_id_user_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_followed_id_user_id_fk" FOREIGN KEY ("followed_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follow_followed_idx" ON "follow" USING btree ("followed_id");