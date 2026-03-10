-- Add email-based auth: email column, verification, and code-based password reset.

-- New verification_codes table for email verification and password reset codes
CREATE TABLE IF NOT EXISTS verification_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('email_verify', 'password_reset')),
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_email_type ON verification_codes(email, type);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires ON verification_codes(expires_at);

-- Rename username to email and add email_verified
ALTER TABLE users RENAME COLUMN username TO email;
ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;

-- Mark existing accounts as verified (so they can log in)
UPDATE users SET email_verified = 1 WHERE email_verified = 0;
