-- Users are now registered by an employee, and their record carries the same
-- details an employee's does: first/last name, mobile, age, address, Aadhaar
-- number, date of birth and five uploaded documents.
--
-- `created_by_employee_id` is the owner of the row. The employee panel only
-- ever shows a user whose owner is the signed-in employee, so one employee can
-- never reach another employee's users. Rows created before this migration
-- (the seeded portal users) keep it NULL, which means "not added by any
-- employee": the admin still sees them, no employee does.
--
-- The profile photo deliberately reuses the existing `profile_image` column
-- instead of adding a second one, so the user portal keeps showing the picture
-- it always did.
--
-- The documents themselves live on disk under
--   uploads/user/<employee-folder>/<user-folder>/
-- and `folder_name` holds that "<employee-folder>/<user-folder>" part.
-- See backend/utils/userFiles.js.
--
-- @applied-if: column users.created_by_employee_id

ALTER TABLE users
  ADD COLUMN created_by_employee_id INT DEFAULT NULL,

  ADD COLUMN first_name VARCHAR(80) DEFAULT NULL,
  ADD COLUMN last_name VARCHAR(80) DEFAULT NULL,
  ADD COLUMN mobile VARCHAR(15) DEFAULT NULL,
  ADD COLUMN age INT DEFAULT NULL,
  ADD COLUMN address TEXT NULL,
  ADD COLUMN aadhaar_number VARCHAR(12) DEFAULT NULL,
  ADD COLUMN date_of_birth DATE DEFAULT NULL,

  ADD COLUMN folder_name VARCHAR(255) DEFAULT NULL,
  ADD COLUMN aadhaar_front VARCHAR(255) DEFAULT NULL,
  ADD COLUMN aadhaar_back VARCHAR(255) DEFAULT NULL,
  ADD COLUMN pan_front VARCHAR(255) DEFAULT NULL,
  ADD COLUMN pan_back VARCHAR(255) DEFAULT NULL;

-- Two users can't share an Aadhaar number. The older rows hold NULL, and MySQL
-- lets a UNIQUE index keep as many NULLs as it likes, so nothing clashes.
ALTER TABLE users
  ADD UNIQUE KEY uq_users_aadhaar (aadhaar_number);

-- "every user this employee added" is the employee panel's main query.
ALTER TABLE users
  ADD INDEX idx_users_employee (created_by_employee_id);
