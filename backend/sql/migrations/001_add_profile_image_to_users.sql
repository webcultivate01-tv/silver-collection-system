-- Adds the profile picture column to "users".
--
-- @applied-if: column users.profile_image

ALTER TABLE users
  ADD COLUMN profile_image VARCHAR(255) DEFAULT NULL;
