-- Adds:
--   * split first/last name + auto-generated employee code on employees
--   * the on-disk document folder and the five document paths
--   * the "per 10 grams" silver rate column
--
-- @applied-if: column employees.employee_code

ALTER TABLE employees
  ADD COLUMN employee_code VARCHAR(20) DEFAULT NULL AFTER id,
  ADD COLUMN first_name VARCHAR(80) NOT NULL DEFAULT '' AFTER employee_code,
  ADD COLUMN last_name VARCHAR(80) NOT NULL DEFAULT '' AFTER first_name,
  ADD COLUMN folder_name VARCHAR(200) DEFAULT NULL AFTER date_of_birth,
  ADD COLUMN profile_photo VARCHAR(255) DEFAULT NULL AFTER folder_name,
  ADD COLUMN aadhaar_front VARCHAR(255) DEFAULT NULL AFTER profile_photo,
  ADD COLUMN aadhaar_back VARCHAR(255) DEFAULT NULL AFTER aadhaar_front,
  ADD COLUMN pan_front VARCHAR(255) DEFAULT NULL AFTER aadhaar_back,
  ADD COLUMN pan_back VARCHAR(255) DEFAULT NULL AFTER pan_front,
  ADD UNIQUE KEY uniq_employee_code (employee_code);

-- Split the existing single name column into first + last.
UPDATE employees
SET first_name = SUBSTRING_INDEX(full_name, ' ', 1),
    last_name  = CASE
                   WHEN LOCATE(' ', full_name) = 0 THEN '-'
                   ELSE TRIM(SUBSTRING(full_name, LOCATE(' ', full_name) + 1))
                 END
WHERE first_name = '';

-- Readable employee IDs for rows registered before this migration.
UPDATE employees
SET employee_code = CONCAT('EMP', LPAD(id, 4, '0'))
WHERE employee_code IS NULL;

-- Document folder name: "<firstname>-<lastname>", uniquified with the code.
UPDATE employees
SET folder_name = LOWER(
      CONCAT(REPLACE(TRIM(first_name), ' ', '-'), '-', REPLACE(TRIM(last_name), ' ', '-'))
    )
WHERE folder_name IS NULL;

-- Rates are published per 10 grams; per gram / per kg stay as derived values.
ALTER TABLE silver_rates
  ADD COLUMN rate_per_10gram DECIMAL(12, 2) NOT NULL DEFAULT 0 AFTER rate_per_gram;

UPDATE silver_rates SET rate_per_10gram = rate_per_gram * 10 WHERE rate_per_10gram = 0;
