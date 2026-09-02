-- Selling silver back: the other half of the counter.
--
-- A purchase turns rupees into grams at the rate the customer BUYS at; a sale
-- turns grams back into rupees at the rate they SELL at (the lower of the two
-- the admin publishes). Both rates are frozen into the row, so neither side
-- re-prices itself when tomorrow's rate lands.
--
-- The grams leave the customer's holding the moment the sale is recorded -
-- the silver is gone whether or not the cash has been counted out yet - but
-- the payout sits at 'pending' until the admin approves it, mirroring the way
-- a purchase's payment_status waits on the cash handover. So an employee can
-- never quietly pay a customer out of the till without the admin seeing it.
--
-- @applied-if: table silver_sales

CREATE TABLE IF NOT EXISTS silver_sales (
  id INT AUTO_INCREMENT PRIMARY KEY,

  -- The customer selling their silver back.
  user_id INT NOT NULL,

  -- The employee at the counter. NULL only if that employee is later deleted.
  employee_id INT DEFAULT NULL,

  -- Six decimals (a microgram), the same precision purchases are stored at -
  -- see backend/utils/silverMath.js for why two would lose real silver.
  grams DECIMAL(14, 6) NOT NULL,

  -- The customer's SELLING rate on the day, frozen at the moment of sale.
  rate_per_gram DECIMAL(10, 2) NOT NULL,

  -- grams x rate_per_gram, at paise precision: what the customer is owed.
  amount_payable DECIMAL(12, 2) NOT NULL,

  sold_on DATE NOT NULL,

  -- 'pending' until the admin approves the payout; 'paid' once they have.
  payout_status ENUM('pending', 'paid') NOT NULL DEFAULT 'pending',

  -- Who in `admins` approved the payout, and when.
  approved_by INT DEFAULT NULL,
  approved_at DATETIME DEFAULT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_sales_user (user_id, sold_on),
  INDEX idx_sales_employee (employee_id, sold_on),
  INDEX idx_sales_status (payout_status)
);
