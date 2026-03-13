-- Defer account creation until email verification.
-- Store password_hash in verification_codes for pending registrations so we can create the user on verify.

ALTER TABLE verification_codes ADD COLUMN password_hash TEXT;
