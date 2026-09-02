-- Silver payouts made by the admin directly, from the admin panel.
--
-- Until now a sell-back could only start at the counter: an employee recorded
-- it, and the admin approved the cash afterwards. The admin panel's Silver
-- Payouts screen now does both halves in one action - the admin picks the
-- employee, then one of that employee's users, sees what they hold, pays part
-- of it out and leaves the rest in the account.
--
-- That is still a sale, and it is still a row in `silver_sales`. There is one
-- ledger for silver leaving a customer's account, and it must stay that way:
-- a second table would let the same gram be paid out twice, because the
-- "do they hold this much" check only locks the tables it knows about.
--
-- Two columns are what an admin-made payout adds:
--
--   recorded_by_admin_id  Who made it. `employee_id` is NULL on these rows
--                         (nobody was at the counter), so without this the
--                         only trace of who paid the customer would be
--                         `approved_by` - which on a counter sale means
--                         something different: the admin who approved someone
--                         else's sale. Keeping the two apart is what lets a
--                         report say "paid directly by the admin" rather than
--                         guessing it from a NULL.
--
--   request_id            An idempotency key. Paying money out is the one
--                         action in this system where doing it twice is worse
--                         than not doing it at all: the holding check stops an
--                         OVERdraw, but two clicks on "Confirm payment", each
--                         within the holding, are two perfectly valid sales as
--                         far as that check is concerned. The screen sends one
--                         id per confirmed payout, and the UNIQUE index turns
--                         a repeat - a double click, a retried request, a
--                         refresh mid-submit - into "you already did this"
--                         instead of a second payout. NULL for every counter
--                         sale, and MySQL allows any number of NULLs in a
--                         unique index, so nothing has to be back-filled.
--
-- @applied-if: column silver_sales.recorded_by_admin_id

ALTER TABLE silver_sales
  ADD COLUMN recorded_by_admin_id INT DEFAULT NULL AFTER employee_id,
  ADD COLUMN request_id VARCHAR(64) DEFAULT NULL AFTER approved_at,
  ADD UNIQUE KEY uq_sales_request_id (request_id),
  ADD INDEX idx_sales_recorded_by_admin (recorded_by_admin_id, sold_on);
