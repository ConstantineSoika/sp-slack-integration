CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sp_user_id  TEXT    NOT NULL UNIQUE,
  client_id   TEXT    NOT NULL,
  client_secret TEXT  NOT NULL,
  bearer_token  TEXT,
  expires_at    INTEGER,  -- unix timestamp
  created_at    INTEGER   NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS slack_configs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slack_webhook_url TEXT   NOT NULL,
  channel_name     TEXT    NOT NULL,
  channel_id       TEXT,
  webhook_token    TEXT    NOT NULL UNIQUE,  -- UUID, forms /webhook/:token
  connected_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS event_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sp_user_id  TEXT    NOT NULL,
  lead_email  TEXT,
  lead_name   TEXT,
  slack_status TEXT   NOT NULL,  -- 'ok' | 'error'
  error_msg   TEXT,
  received_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_slack_configs_token ON slack_configs(webhook_token);
CREATE INDEX IF NOT EXISTS idx_slack_configs_user  ON slack_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_event_log_user      ON event_log(sp_user_id);
