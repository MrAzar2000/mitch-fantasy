CREATE TABLE site_activity (
 id serial PRIMARY KEY,
 event_id text UNIQUE NOT NULL,
 category text NOT NULL,
 action text NOT NULL,
 team_id integer,
 device_id text,
 session_id text,
 detail text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX site_activity_created ON site_activity (created_at DESC);
CREATE INDEX site_activity_team ON site_activity (team_id, created_at DESC);
CREATE TABLE site_feedback (
 id serial PRIMARY KEY,
 request_id text UNIQUE NOT NULL,
 team_id integer,
 kind text NOT NULL CHECK (kind IN ('problem','suggestion')),
 title text NOT NULL,
 message text NOT NULL,
 page text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved')),
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO site_activity (event_id, category, action, detail) VALUES (
 'release-20261022-site-tools', 'change', 'release_notes',
 'Added persistent site activity and notification logs, a Problems & Suggestions page with admin status tracking, best projected starters and estimated ceiling lineups in team details, and elimination numbers beside games behind in the playoff picture. Tracking begins with this release; earlier activity cannot be reconstructed.'
);
