CREATE TABLE IF NOT EXISTS push_subscriptions (
  device_id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  notify_at INTEGER,
  sent_for INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_due
  ON push_subscriptions (notify_at)
  WHERE notify_at IS NOT NULL;
