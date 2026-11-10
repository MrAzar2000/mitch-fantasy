ALTER TABLE parlay_weeks ADD COLUMN placed boolean NOT NULL DEFAULT false;
INSERT INTO parlay_weeks (season, week, placed)
SELECT DISTINCT season, week, true FROM parlay_legs WHERE result IN ('won', 'lost')
ON CONFLICT (season, week) DO UPDATE SET placed = true;
