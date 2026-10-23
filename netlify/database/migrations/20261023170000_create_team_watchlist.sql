CREATE TABLE team_watchlist (
  league_id text NOT NULL,
  season integer NOT NULL,
  team_id integer NOT NULL,
  player_id integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, season, team_id, player_id)
);
