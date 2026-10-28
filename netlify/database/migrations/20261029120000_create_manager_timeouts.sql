CREATE TABLE manager_timeouts (
  team_id integer PRIMARY KEY CHECK (team_id > 0 AND team_id < 100000),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
