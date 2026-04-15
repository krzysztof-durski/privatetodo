CREATE TABLE IF NOT EXISTS tab_access (
  id TEXT PRIMARY KEY,
  tab_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('edit', 'view')),
  invited_by INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (tab_id, user_id),
  FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tab_invitations (
  id TEXT PRIMARY KEY,
  tab_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('edit', 'view')),
  invited_by INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_tab_access_tab ON tab_access(tab_id);
CREATE INDEX IF NOT EXISTS idx_tab_access_user ON tab_access(user_id);
CREATE INDEX IF NOT EXISTS idx_tab_invites_email ON tab_invitations(email);
