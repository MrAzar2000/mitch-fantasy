CREATE TABLE "parlay_legs" (
	"id" serial PRIMARY KEY,
	"season" integer NOT NULL,
	"week" integer NOT NULL,
	"team_id" integer NOT NULL,
	"manager" text NOT NULL,
	"pick" text NOT NULL,
	"odds" text,
	"result" text DEFAULT 'pending' NOT NULL,
	"source_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "parlay_source_id" ON "parlay_legs" ("source_id");