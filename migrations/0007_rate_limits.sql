CREATE TABLE IF NOT EXISTS rate_limits (
  identifier TEXT NOT NULL,
  route TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (identifier, route, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_route_window ON rate_limits(route, window_start);
