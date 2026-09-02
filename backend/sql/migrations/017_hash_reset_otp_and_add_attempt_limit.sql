-- Password-reset OTPs: stored hashed, and limited to a few attempts.
--
-- Three things were wrong with the old design, and all three point the same
-- way - succeeding at a password reset means owning the account:
--
--   * the code was generated with Math.random(), which is not a secure
--     generator: its state can be recovered from a handful of observed
--     outputs, so an attacker able to request OTPs for their own account
--     could predict somebody else's;
--   * it was stored exactly as it was emailed, so a backup, a log or a dump
--     handed over every live reset code in plain text;
--   * a wrong guess left the code usable, so the six-digit space could simply
--     be exhausted.
--
-- The generator is fixed in utils/generateOtp.js. This migration covers the
-- storage: `reset_otp` has to hold a 64-character SHA-256 hex digest rather
-- than six digits, and `reset_otp_attempts` is what makes a code die after
-- five wrong guesses instead of lasting its full ten minutes.
--
-- Existing rows: any OTP outstanding when this runs was stored in the old
-- plain-text form and will no longer verify. That is intended - those codes
-- are exactly the ones this change exists to invalidate - and the affected
-- person simply requests a new one.
--
-- @applied-if: column admins.reset_otp_attempts

ALTER TABLE admins
  MODIFY COLUMN reset_otp VARCHAR(64) DEFAULT NULL,
  ADD COLUMN reset_otp_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER reset_otp_expires;

ALTER TABLE sub_admins
  MODIFY COLUMN reset_otp VARCHAR(64) DEFAULT NULL,
  ADD COLUMN reset_otp_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER reset_otp_expires;

ALTER TABLE users
  MODIFY COLUMN reset_otp VARCHAR(64) DEFAULT NULL,
  ADD COLUMN reset_otp_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER reset_otp_expires;

ALTER TABLE employees
  MODIFY COLUMN reset_otp VARCHAR(64) DEFAULT NULL,
  ADD COLUMN reset_otp_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER reset_otp_expires;

-- Any code issued before this change cannot be verified against the new
-- storage, so clear them rather than leaving rows that can never succeed.
UPDATE admins SET reset_otp = NULL, reset_otp_expires = NULL WHERE reset_otp IS NOT NULL;
UPDATE sub_admins SET reset_otp = NULL, reset_otp_expires = NULL WHERE reset_otp IS NOT NULL;
UPDATE users SET reset_otp = NULL, reset_otp_expires = NULL WHERE reset_otp IS NOT NULL;
UPDATE employees SET reset_otp = NULL, reset_otp_expires = NULL WHERE reset_otp IS NOT NULL;
