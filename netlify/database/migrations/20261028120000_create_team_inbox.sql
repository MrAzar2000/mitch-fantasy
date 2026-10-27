CREATE TABLE team_inbox_messages (
  id serial PRIMARY KEY,
  activity_id integer NOT NULL UNIQUE REFERENCES site_activity(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '/',
  team_ids jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (team_ids IS NULL OR jsonb_typeof(team_ids) = 'array')
);
CREATE INDEX team_inbox_messages_audience ON team_inbox_messages USING gin (team_ids);
CREATE TABLE team_inbox_reads (
  device_id text NOT NULL,
  team_id integer NOT NULL CHECK (team_id > 0 AND team_id < 100000),
  message_id integer NOT NULL REFERENCES team_inbox_messages(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, team_id, message_id)
);
