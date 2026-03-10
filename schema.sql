-- Users: email + hashed password + settings (username kept for display, derived from email)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  email_verified INTEGER DEFAULT 0,
  password_hash TEXT NOT NULL,
  accent_color TEXT DEFAULT '#7c5cff',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Sessions for auth
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Tabs (task categories)
CREATE TABLE IF NOT EXISTS tabs (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Tasks (active)
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  tab_id TEXT NOT NULL,
  text TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  completed_at TEXT,
  "order" INTEGER NOT NULL,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (tab_id) REFERENCES tabs(id)
);

-- Completed tasks (history)
CREATE TABLE IF NOT EXISTS completed_tasks (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  tab_id TEXT,
  tab_name TEXT,
  text TEXT NOT NULL,
  note TEXT,
  completed_at TEXT NOT NULL,
  created_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Deleted tasks (history)
CREATE TABLE IF NOT EXISTS deleted_tasks (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  tab_id TEXT,
  tab_name TEXT,
  text TEXT NOT NULL,
  note TEXT,
  deleted_at TEXT NOT NULL,
  created_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Password reset tokens (legacy, used for link-based reset)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Verification codes for email verification and code-based password reset
CREATE TABLE IF NOT EXISTS verification_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('email_verify', 'password_reset')),
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_expires ON password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_verification_codes_email_type ON verification_codes(email, type);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires ON verification_codes(expires_at);

CREATE INDEX IF NOT EXISTS idx_tasks_user_tab ON tasks(user_id, tab_id);
CREATE INDEX IF NOT EXISTS idx_tabs_user ON tabs(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_completed_user ON completed_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_deleted_user ON deleted_tasks(user_id);
