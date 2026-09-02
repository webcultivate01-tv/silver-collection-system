-- Gives every kind of account its own table.
--
-- Before this migration one `users` table held three different things, told
-- apart by a `role` column: the main admin, the sub-admins and the plain users.
-- That made every change a compromise - a column only sub-admins need still
-- landed on the admin rows, and every query had to remember to filter by role.
--
-- After this migration:
--
--   admins      -> main admin(s),  sign in at /admin
--   sub_admins  -> sub-admins,     sign in at /admin, read-only dashboard
--   users       -> plain users,    sign in at /user
--   employees   -> staff,          sign in at /employee   (already separate)
--
-- Each table can now grow its own columns without touching the others.
--
-- Ids are copied across unchanged, so anything that already points at an
-- account id keeps pointing at the right row: sub_admins.created_by ->
-- admins.id, silver_rates.updated_by -> admins.id, and a JWT issued before
-- this migration ({ id, role }) still resolves to the same account - nobody
-- gets signed out by the upgrade.
--
-- The trade-off is that an id is only unique inside its own table now, so
-- admin #1 and user #1 both exist. Nothing may look an account up by id alone
-- any more; the role always comes with it (see models/accounts.js).
--
-- @applied-if: table admins

-- The main admin. There is normally exactly one row here.
CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,

  is_active TINYINT(1) NOT NULL DEFAULT 1,
  profile_image VARCHAR(255) DEFAULT NULL,

  -- Used only for the "Forgot Password" OTP flow
  reset_otp VARCHAR(10) DEFAULT NULL,
  reset_otp_expires DATETIME DEFAULT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Sub-admins: created by the main admin, read + download only.
CREATE TABLE IF NOT EXISTS sub_admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,

  -- The main admin can deactivate a sub-admin; a deactivated account cannot
  -- sign in and any token it still holds stops working on the next request.
  is_active TINYINT(1) NOT NULL DEFAULT 1,

  -- Which row in `admins` created this account.
  created_by INT DEFAULT NULL,

  profile_image VARCHAR(255) DEFAULT NULL,

  reset_otp VARCHAR(10) DEFAULT NULL,
  reset_otp_expires DATETIME DEFAULT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Move the existing rows out of `users`, keeping their ids.
INSERT INTO admins
  (id, name, email, password, is_active, profile_image, reset_otp, reset_otp_expires,
   created_at, updated_at)
SELECT
  id, name, email, password, is_active, profile_image, reset_otp, reset_otp_expires,
  created_at, updated_at
FROM users
WHERE role = 'admin';

INSERT INTO sub_admins
  (id, name, email, password, is_active, created_by, profile_image, reset_otp,
   reset_otp_expires, created_at, updated_at)
SELECT
  id, name, email, password, is_active, created_by, profile_image, reset_otp,
  reset_otp_expires, created_at, updated_at
FROM users
WHERE role = 'subadmin';

DELETE FROM users WHERE role IN ('admin', 'subadmin');

-- `users` now means one thing only, so the columns that existed just to tell
-- the three kinds apart are no longer needed.
ALTER TABLE users
  DROP COLUMN role,
  DROP COLUMN created_by;
