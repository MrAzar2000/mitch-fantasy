CREATE TABLE "roster_alert_deliveries" (
	"alert_key" text PRIMARY KEY,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
