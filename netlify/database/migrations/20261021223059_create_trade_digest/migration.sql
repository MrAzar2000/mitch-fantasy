CREATE TABLE "trade_digest_additions" (
	"id" text PRIMARY KEY,
	"team_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "trade_digest_runs" (
	"day" text PRIMARY KEY,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
