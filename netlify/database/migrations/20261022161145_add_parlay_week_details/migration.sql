CREATE TABLE "parlay_weeks" (
	"id" serial PRIMARY KEY,
	"season" integer NOT NULL,
	"week" integer NOT NULL,
	"participants" text DEFAULT '' NOT NULL,
	"total_odds" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "parlay_week_season" ON "parlay_weeks" ("season","week");