CREATE TABLE "invite" (
	"id" text PRIMARY KEY NOT NULL,
	"created_by_user_id" text NOT NULL,
	"redeemed_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"redeemed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"city" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"invite_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"invited_at" timestamp,
	CONSTRAINT "waitlist_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_redeemed_by_user_id_user_id_fk" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_invite_id_invite_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invite"("id") ON DELETE set null ON UPDATE no action;