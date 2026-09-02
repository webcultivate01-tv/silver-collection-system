-- The daily cash handover: an employee collects payments all day, and every
-- purchase they record sits at payment_status = 'pending' until the cash for
-- it has actually reached the admin.
--
-- At the end of the day the employee bundles every purchase of theirs that
-- hasn't yet been handed over into one `cash_settlements` row (a "handover")
-- and hands the admin that total in person. The purchases move to that
-- settlement (`settlement_id`) but stay 'pending' - the admin hasn't taken
-- the cash yet, only been told it's coming.
--
-- Only when the admin accepts the handover does the settlement flip to
-- 'accepted' and every purchase it carries flip to 'success', in one
-- transaction (see models/cashSettlementModel.js) - so the employee's list,
-- the admin panel and the customer's own history can never disagree about
-- whether a payment has been settled.
--
-- @applied-if: table cash_settlements

CREATE TABLE IF NOT EXISTS cash_settlements (
  id INT AUTO_INCREMENT PRIMARY KEY,

  -- The employee handing over the cash.
  employee_id INT NOT NULL,

  -- The day the handover was made (not necessarily the day every bundled
  -- purchase happened - a missed handover simply catches up next time).
  settlement_date DATE NOT NULL,

  total_amount DECIMAL(12, 2) NOT NULL,
  purchase_count INT NOT NULL DEFAULT 0,

  status ENUM('pending', 'accepted') NOT NULL DEFAULT 'pending',

  -- Who in `admins` accepted the cash, and when.
  accepted_by INT DEFAULT NULL,
  accepted_at DATETIME DEFAULT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_settlements_employee (employee_id, status),
  INDEX idx_settlements_status (status)
);

ALTER TABLE silver_purchases
  -- 'pending' until the handover carrying this purchase is accepted.
  ADD COLUMN payment_status ENUM('pending', 'success') NOT NULL DEFAULT 'pending',

  -- Which handover this purchase was bundled into. NULL means the employee
  -- hasn't handed this one over yet.
  ADD COLUMN settlement_id INT DEFAULT NULL,

  ADD INDEX idx_purchases_settlement (settlement_id);
