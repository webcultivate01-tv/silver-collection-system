-- Adds the Sub-Admin role to an existing database.
--
--   * is_active  - the main admin can deactivate a sub-admin; a deactivated
--                  account can no longer sign in and any token it still holds
--                  stops working on the next request.
--   * created_by - which admin created the account (sub-admins only).
--
-- The `role` column already exists; these are the values now in use:
--   role = 'admin'    -> main admin, signs in at /admin, full admin panel
--   role = 'subadmin' -> sub-admin,  signs in at /admin, read-only dashboard
--   role = 'user'     -> plain user, signs in at /user
--
-- @applied-if: column users.is_active

ALTER TABLE users
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER role,
  ADD COLUMN created_by INT DEFAULT NULL AFTER is_active;

-- Everyone registered before this migration stays active.
UPDATE users SET is_active = 1;
