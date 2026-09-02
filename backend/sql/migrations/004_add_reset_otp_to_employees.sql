-- Adds:
--   * the OTP columns employees need for their own "Forgot password" flow
--     (the admin/user accounts in `users` already had them)
--
-- @applied-if: column employees.reset_otp

ALTER TABLE employees
  ADD COLUMN reset_otp VARCHAR(10) DEFAULT NULL AFTER must_change_password,
  ADD COLUMN reset_otp_expires DATETIME DEFAULT NULL AFTER reset_otp;

-- The `users` table holds both the admin and the plain-user accounts; the role
-- column already exists, this just documents the two values in use.
--   role = 'admin'  -> signs in at /admin, gets the dashboard
--   role = 'user'   -> signs in at /user,  gets the user portal
