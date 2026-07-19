CREATE TABLE "map_share" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "map_share_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "map_share" ADD CONSTRAINT "map_share_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;