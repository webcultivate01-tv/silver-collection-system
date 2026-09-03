-- Run this once in MySQL to create the database and its tables.
-- Example: mysql -u root -p < sql/schema.sql
--
-- Every kind of account has its own table, so each one can grow its own
-- columns without disturbing the others:
--
--   admins      -> main admin,  signs in at /admin,     full admin panel
--   sub_admins  -> sub-admin,   signs in at /admin,     read-only dashboard
--   users       -> plain user,  signs in at /user,      user portal
--   employees   -> staff,       signs in at /employee,  employee portal
--   
-- An account's id is only unique inside its own table, so the code always
-- carries the role alongside the id (the JWT holds both) to know which table
-- a given id belongs to.

CREATE DATABASE IF NOT EXISTS auth_module_db;

USE auth_module_db;

-- The main admin. There is normally exactly one row here; it is created by
-- `npm run seed`.
CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,

  is_active TINYINT(1) NOT NULL DEFAULT 1,
  profile_image VARCHAR(255) DEFAULT NULL,

  -- Used only for the "Forgot Password" OTP flow
  reset_otp VARCHAR(64) DEFAULT NULL,
  reset_otp_expires DATETIME DEFAULT NULL,
  -- Wrong guesses so far; the code dies after five (see migration 017).
  reset_otp_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Sub-admins, created by the main admin from Admin Management.
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

  reset_otp VARCHAR(64) DEFAULT NULL,
  reset_otp_expires DATETIME DEFAULT NULL,
  -- Wrong guesses so far; the code dies after five (see migration 017).
  reset_otp_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Plain users of the portal at /user. Normally registered by an employee from
-- the employee panel's User Management screen; `npm run seed:user` can also
-- create one by hand.
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,

  is_active TINYINT(1) NOT NULL DEFAULT 1,

  -- Also the user's profile photo, uploaded with their documents below.
  profile_image VARCHAR(255) DEFAULT NULL,

  -- The employee who registered this user. Only that employee may see or edit
  -- them; the admin sees everybody's. NULL means "not added by an employee".
  created_by_employee_id INT DEFAULT NULL,

  -- The same details an employee's record carries.
  first_name VARCHAR(80) DEFAULT NULL,
  last_name VARCHAR(80) DEFAULT NULL,
  mobile VARCHAR(15) DEFAULT NULL,
  age INT DEFAULT NULL,
  address TEXT NULL,
  aadhaar_number VARCHAR(12) DEFAULT NULL UNIQUE,
  -- "ABCDE1234F". NULL only on rows registered before it was asked for.
  pan_number VARCHAR(10) DEFAULT NULL UNIQUE,
  date_of_birth DATE DEFAULT NULL,

  -- Documents live on disk in uploads/user/<employee-folder>/<user-folder>/,
  -- which is what folder_name holds; the columns keep each file's public path.
  folder_name VARCHAR(255) DEFAULT NULL,
  aadhaar_front VARCHAR(255) DEFAULT NULL,
  aadhaar_back VARCHAR(255) DEFAULT NULL,
  pan_front VARCHAR(255) DEFAULT NULL,
  -- Legacy: the form only asks for the front of the PAN card now. Kept so the
  -- back-side scans uploaded before that change are not lost.
  pan_back VARCHAR(255) DEFAULT NULL,

  reset_otp VARCHAR(64) DEFAULT NULL,
  reset_otp_expires DATETIME DEFAULT NULL,
  -- Wrong guesses so far; the code dies after five (see migration 017).
  reset_otp_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_users_employee (created_by_employee_id)
);

-- Staff registered by the admin from the Employee Management module.
CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,

  -- Generated automatically from the row id, e.g. "EMP0007".
  employee_code VARCHAR(20) DEFAULT NULL UNIQUE,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  full_name VARCHAR(150) NOT NULL,

  mobile VARCHAR(15) NOT NULL,
  -- Optional second contact number.
  alternate_mobile VARCHAR(15) DEFAULT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  age INT NOT NULL,
  address TEXT NOT NULL,
  aadhaar_number VARCHAR(12) NOT NULL UNIQUE,
  -- "ABCDE1234F". NULL only on rows registered before it was asked for.
  pan_number VARCHAR(10) DEFAULT NULL UNIQUE,
  date_of_birth DATE NOT NULL,

  -- Documents live on disk in uploads/employees/<folder_name>/ and the
  -- columns below hold each file's public path.
  folder_name VARCHAR(200) DEFAULT NULL,
  profile_photo VARCHAR(255) DEFAULT NULL,
  aadhaar_front VARCHAR(255) DEFAULT NULL,
  aadhaar_back VARCHAR(255) DEFAULT NULL,
  pan_front VARCHAR(255) DEFAULT NULL,
  -- Legacy: the form only asks for the front of the PAN card now. Kept so the
  -- back-side scans uploaded before that change are not lost.
  pan_back VARCHAR(255) DEFAULT NULL,

  password VARCHAR(255) NOT NULL,
  must_change_password TINYINT(1) NOT NULL DEFAULT 1,

  -- Used only by the employee "Forgot Password" OTP flow
  reset_otp VARCHAR(64) DEFAULT NULL,
  reset_otp_expires DATETIME DEFAULT NULL,
  -- Wrong guesses so far; the code dies after five (see migration 017).
  reset_otp_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,

  is_blocked TINYINT(1) NOT NULL DEFAULT 0,
  blocked_at DATETIME DEFAULT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- One row per day; rate_date is UNIQUE so re-saving today's rate updates it.
-- The admin publishes two per-gram figures: the buying rate and the selling rate.
CREATE TABLE IF NOT EXISTS silver_rates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rate_date DATE NOT NULL UNIQUE,
  buy_rate_per_gram DECIMAL(14,6) NOT NULL DEFAULT 0,
  sell_rate_per_gram DECIMAL(14,6) NOT NULL DEFAULT 0,

  -- The row in `admins` that last published a rate.
  updated_by INT DEFAULT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- One row per payment a customer makes for silver. An employee records it at
-- the counter; the customer is a row in `users`.
--
-- The rate and the weight are both frozen into the row: the rate moves daily,
-- so a purchase that re-derived its weight later would silently re-price
-- itself. `grams` carries six decimals (a microgram) because a payment usually
-- buys a fraction of a gram - ₹100 at ₹105/g is 0.952381 g, i.e. 952.381 mg,
-- and two decimals would have rounded 2.38 mg of it away.
CREATE TABLE IF NOT EXISTS silver_purchases (
  id INT AUTO_INCREMENT PRIMARY KEY,

  user_id INT NOT NULL,
  -- NULL-able so deleting a member of staff never deletes a customer's record.
  employee_id INT DEFAULT NULL,

  amount_paid DECIMAL(12, 2) NOT NULL,
  rate_per_gram DECIMAL(14, 6) NOT NULL,
  grams DECIMAL(14, 6) NOT NULL,
  purchased_on DATE NOT NULL,

  -- 'pending' until the cash handover carrying this purchase (see
  -- cash_settlements below) has been accepted by the admin.
  payment_status ENUM('pending', 'success') NOT NULL DEFAULT 'pending',
  -- Which handover this purchase was bundled into. NULL = not handed over yet.
  settlement_id INT DEFAULT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_purchases_user (user_id, purchased_on),
  INDEX idx_purchases_employee (employee_id, purchased_on),
  INDEX idx_purchases_settlement (settlement_id)
);

-- The daily cash handover. An employee bundles every purchase they've taken
-- that hasn't yet been handed over into one row here and gives the admin that
-- total in cash; the admin accepting it is what flips those purchases (and
-- this row) from 'pending' to 'success' - see
-- backend/models/cashSettlementModel.js for the transaction that keeps the
-- two in step.
CREATE TABLE IF NOT EXISTS cash_settlements (
  id INT AUTO_INCREMENT PRIMARY KEY,

  employee_id INT NOT NULL,
  settlement_date DATE NOT NULL,
  total_amount DECIMAL(12, 2) NOT NULL,
  purchase_count INT NOT NULL DEFAULT 0,

  status ENUM('pending', 'accepted') NOT NULL DEFAULT 'pending',

  -- Who accepted the cash, and when. Ids restart at 1 in every account table,
  -- so the role is half the answer: (accepted_by_role, accepted_by) is what
  -- names the account - the main admin in `admins`, or a sub-admin in
  -- `sub_admins`. Both can accept a handover.
  accepted_by INT DEFAULT NULL,
  accepted_by_role ENUM('admin', 'subadmin') NOT NULL DEFAULT 'admin',
  accepted_at DATETIME DEFAULT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_settlements_employee (employee_id, status),
  INDEX idx_settlements_status (status)
);

-- The other half of the counter: a customer selling silver back for cash.
--
-- A purchase turns rupees into grams at the customer's BUYING rate; a sale
-- turns grams back into rupees at their SELLING rate. Both are frozen into
-- the row so neither re-prices itself later.
--
-- The grams leave the holding as soon as the sale is recorded, but
-- payout_status stays 'pending' until the admin approves the cash going out -
-- the mirror image of a purchase waiting on the cash handover.
CREATE TABLE IF NOT EXISTS silver_sales (
  id INT AUTO_INCREMENT PRIMARY KEY,

  user_id INT NOT NULL,

  -- The employee at the counter. NULL on a payout the admin made directly
  -- from the panel, where nobody was at the counter.
  employee_id INT DEFAULT NULL,

  -- The admin who paid the customer out from the panel. NULL on a counter
  -- sale. Distinct from `approved_by`, which on a counter sale is the admin
  -- who approved somebody else's sale.
  recorded_by_admin_id INT DEFAULT NULL,

  -- Six decimals, matching silver_purchases.grams.
  grams DECIMAL(14, 6) NOT NULL,
  rate_per_gram DECIMAL(14, 6) NOT NULL,
  amount_payable DECIMAL(12, 2) NOT NULL,

  -- What the customer actually received. 'cash' when an employee bought the
  -- silver back at the counter; 'coin' when the admin handed them a silver
  -- coin from the panel, where no money changes hands at all.
  payout_kind ENUM('cash', 'coin') NOT NULL DEFAULT 'cash',

  sold_on DATE NOT NULL,

  payout_status ENUM('pending', 'paid') NOT NULL DEFAULT 'pending',
  approved_by INT DEFAULT NULL,
  approved_at DATETIME DEFAULT NULL,

  -- Idempotency key for an admin payout: one id per confirmed payout, so a
  -- double click or a retried request can't pay the same customer twice.
  -- NULL on every counter sale; MySQL allows any number of NULLs here.
  request_id VARCHAR(64) DEFAULT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_sales_request_id (request_id),
  INDEX idx_sales_user (user_id, sold_on),
  INDEX idx_sales_employee (employee_id, sold_on),
  INDEX idx_sales_recorded_by_admin (recorded_by_admin_id, sold_on),
  INDEX idx_sales_status (payout_status)
);

-- Enquiries from the public landing page's contact form.
--
-- The one table written by somebody with no account at all. An enquiry is
-- stored first and mailed to the admins second, so a missed or deleted email
-- no longer means a lost customer - the panels read the row back on the
-- Enquiries screen and work it from 'new' to 'closed'.
--
-- `handled_by` is (role, id), like cash_settlements.accepted_by: both panel
-- roles work these, and an id alone doesn't say which table it came from.
CREATE TABLE IF NOT EXISTS enquiries (
  id INT AUTO_INCREMENT PRIMARY KEY,

  name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,

  status ENUM('new', 'in_progress', 'closed') NOT NULL DEFAULT 'new',

  -- The panel's own notes. Never shown to the person who wrote in.
  admin_note TEXT DEFAULT NULL,

  handled_by INT DEFAULT NULL,
  handled_by_role ENUM('admin', 'subadmin') DEFAULT NULL,
  handled_at DATETIME DEFAULT NULL,

  -- 0 when the notification mail could not be sent: the row is then the only
  -- place this enquiry exists.
  emailed TINYINT(1) NOT NULL DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_enquiries_status (status, created_at),
  INDEX idx_enquiries_created (created_at)
);
