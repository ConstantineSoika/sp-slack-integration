CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sp_user_id  TEXT    NOT NULL UNIQUE,
  client_id   TEXT    NOT NULL,
  client_secret TEXT  NOT NULL,
  bearer_token  TEXT,
  expires_at    INTEGER,  -- unix timestamp
  theme       TEXT    NOT NULL DEFAULT 'dark',
  lang        TEXT    NOT NULL DEFAULT 'en',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
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
  popup_id    TEXT,
  popup_name  TEXT,
  lead_email  TEXT,
  lead_name   TEXT,
  slack_status TEXT   NOT NULL,  -- 'ok' | 'error' | 'dropped'
  error_msg   TEXT,
  received_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Per-popup routing rules: map a SP popup_id to a specific Slack channel config
-- If no rule matches the incoming popup_id, the lead is dropped (not forwarded)
-- If no rules exist at all, all leads go to the default slack_config
CREATE TABLE IF NOT EXISTS popup_routes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  popup_id         TEXT    NOT NULL,
  popup_name       TEXT,                        -- display label, synced from SP
  slack_webhook_url TEXT   NOT NULL,            -- can differ per route
  channel_name     TEXT    NOT NULL,
  enabled          INTEGER NOT NULL DEFAULT 1,  -- 0 = paused
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, popup_id)
);

-- Additional Slack channels a user can route popups to (beyond the primary connection)
CREATE TABLE IF NOT EXISTS slack_channels (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slack_webhook_url TEXT   NOT NULL,
  channel_name     TEXT    NOT NULL,
  channel_id       TEXT,
  connected_at     INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_slack_channels_user ON slack_channels(user_id);

CREATE INDEX IF NOT EXISTS idx_slack_configs_token ON slack_configs(webhook_token);
CREATE INDEX IF NOT EXISTS idx_slack_configs_user  ON slack_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_event_log_user      ON event_log(sp_user_id);
CREATE INDEX IF NOT EXISTS idx_popup_routes_user   ON popup_routes(user_id);
