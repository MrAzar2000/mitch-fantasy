CREATE TABLE manager_preferences (
  device_id text PRIMARY KEY,
  watched_players jsonb NOT NULL DEFAULT '[]',
  favorite_pages jsonb NOT NULL DEFAULT '[]',
  alert_categories jsonb NOT NULL DEFAULT '["league","matchup","trade"]',
  quiet_start integer,
  quiet_end integer,
  utc_offset integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
