-- The admin's Employee Management form now asks for two more things:
--
--   * PAN number - required, the ten-character "ABCDE1234F" code. Like the
--     Aadhaar number it identifies one person, so it is UNIQUE. Employees
--     registered before this migration keep NULL, and MySQL allows any number
--     of NULLs in a unique index, so nothing has to be back-filled.
--
--   * Alternate mobile - optional second contact number.
--
-- The PAN card *back side* is no longer collected: the form only asks for the
-- front. The `pan_back` column stays where it is so the scans already uploaded
-- are not thrown away; nothing reads or writes it any more.
--
-- Users (registered by an employee) were unaffected by this migration; 013
-- makes the same two changes to their form.
--
-- @applied-if: column employees.pan_number

ALTER TABLE employees
  ADD COLUMN pan_number VARCHAR(10) DEFAULT NULL AFTER aadhaar_number,
  ADD COLUMN alternate_mobile VARCHAR(15) DEFAULT NULL AFTER mobile,
  ADD UNIQUE KEY uq_employees_pan_number (pan_number);
