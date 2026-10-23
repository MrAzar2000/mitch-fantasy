ALTER TABLE manager_preferences ADD COLUMN subscription_hash text;
CREATE INDEX manager_preferences_subscription_idx ON manager_preferences (subscription_hash);
