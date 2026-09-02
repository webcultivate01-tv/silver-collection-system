-- What the customer actually walked away with.
--
-- A payout was, until now, always cash: an employee bought silver back at the
-- counter and the till paid for it. The admin panel's payout screen does
-- something different - it hands the customer a SILVER COIN of the weight the
-- admin enters. No money changes hands at all. The silver simply stops being a
-- balance in an account and becomes a coin in the customer's pocket.
--
-- Both are rows in silver_sales, because both are the same event as far as the
-- ledger is concerned: silver leaving a customer's holding. But they are not
-- the same thing to the customer, and a history that shows them identically
-- would be telling them they were paid money when they were handed a coin.
--
-- `recorded_by_admin_id` could stand in for this - today, every admin payout
-- is a coin and every counter sale is cash - but that is a coincidence of the
-- current screens, not a fact about the ledger. The day an admin pays cash, or
-- an employee hands over a coin, every past row would silently start reading
-- as the wrong thing. What was handed over is its own fact, so it gets its own
-- column.
--
-- Existing rows: everything recorded by an admin was a coin payout from the
-- panel; everything else was cash at the counter. That is exactly what those
-- rows were, so the back-fill is a statement of fact, not a guess.
--
-- @applied-if: column silver_sales.payout_kind

ALTER TABLE silver_sales
  ADD COLUMN payout_kind ENUM('cash', 'coin') NOT NULL DEFAULT 'cash' AFTER amount_payable;

UPDATE silver_sales
   SET payout_kind = 'coin'
 WHERE recorded_by_admin_id IS NOT NULL;
