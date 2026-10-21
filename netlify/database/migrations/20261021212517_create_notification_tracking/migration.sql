CREATE TABLE "notification_devices" (
	"id" text PRIMARY KEY,
	"team_id" integer,
	"permission" text NOT NULL,
	"subscribed" integer DEFAULT 0 NOT NULL,
	"installed_at" timestamp with time zone,
	"bell_count" integer DEFAULT 0 NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_events" (
	"id" serial PRIMARY KEY,
	"device_id" text NOT NULL,
	"team_id" integer,
	"event" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
