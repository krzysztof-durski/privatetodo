-- Add 'account_delete' type to verification_codes for account deletion confirmation.

CREATE TABLE verification_codes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('email_verify', 'password_reset', 'account_delete')),
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
INSERT INTO verification_codes_new SELECT * FROM verification_codes;
DROP TABLE verification_codes;
ALTER TABLE verification_codes_new RENAME TO verification_codes;
CREATE INDEX IF NOT EXISTS idx_verification_codes_email_type ON verification_codes(email, type);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires ON verification_codes(expires_at);
