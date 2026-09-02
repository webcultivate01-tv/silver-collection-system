-- The purchase ledger: one row per payment a customer makes for silver.
--
-- An employee takes the money at the counter and records it against a customer
-- (a row in `users`). What the customer gets is worked out here and never
-- re-derived later, because the rate moves every day - a purchase has to keep
-- the rate it was made at, or last month's payment would silently re-price
-- itself every time somebody opened a report.
--
-- `grams` is DECIMAL(14,6): six decimals, down to a microgram. At ₹105/g a
-- ₹100 payment buys 0.952381 g - 952.381 mg - and two decimals would have
-- rounded that to 0.95 g, keeping 2.38 mg of the customer's silver.
--
-- @applied-if: table silver_purchases

CREATE TABLE IF NOT EXISTS silver_purchases (
  id INT AUTO_INCREMENT PRIMARY KEY,

  -- The customer, a row in `users`.
  user_id INT NOT NULL,

  -- The employee who took the payment. Kept NULL-able so deleting a member of
  -- staff never takes a customer's purchase with it.
  employee_id INT DEFAULT NULL,

  amount_paid DECIMAL(12, 2) NOT NULL,

  -- The selling rate on the day - the customer is buying FROM the shop.
  rate_per_gram DECIMAL(10, 2) NOT NULL,

  -- amount_paid / rate_per_gram, rounded to six decimals. See utils/silverMath.
  grams DECIMAL(14, 6) NOT NULL,

  purchased_on DATE NOT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- A customer's own history, newest first, is the common read.
  INDEX idx_purchases_user (user_id, purchased_on),
  INDEX idx_purchases_employee (employee_id, purchased_on)
);
