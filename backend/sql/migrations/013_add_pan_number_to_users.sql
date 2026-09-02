-- The employee panel's Add User form now asks for the user's PAN number as
-- well as their Aadhaar number. Like the Aadhaar number it identifies one
-- person, so it is UNIQUE. Users registered before this migration keep NULL,
-- and MySQL allows any number of NULLs in a unique index, so nothing has to be
-- back-filled; their employee fills it in the next time the record is edited.
--
-- The PAN card *back side* is no longer collected from a user either - the
-- form only asks for the front, the same as the admin's employee form since
-- 012. The `pan_back` column stays where it is so the scans already uploaded
-- are not thrown away; nothing reads or writes it any more.
--
-- @applied-if: column users.pan_number

ALTER TABLE users
  ADD COLUMN pan_number VARCHAR(10) DEFAULT NULL AFTER aadhaar_number,
  ADD UNIQUE KEY uq_users_pan_number (pan_number);
