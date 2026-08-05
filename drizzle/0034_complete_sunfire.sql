CREATE TABLE "place_photo" (
	"external_id" text PRIMARY KEY NOT NULL,
	"url" text,
	"source" text,
	"checked_at" timestamp DEFAULT now() NOT NULL
);
