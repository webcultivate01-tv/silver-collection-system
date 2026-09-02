-- Who accepted an employee's cash handover - and which table that account
-- lives in.
--
-- Accepting cash used to be the main admin's alone, so `accepted_by` could be
-- read as "a row in `admins`" and joined straight to it. Sub-admins now accept
-- handovers too, and ids restart at 1 in every account table (see
-- models/accounts.js) - so admin #3 and sub-admin #3 both exist and
-- `accepted_by = 3` no longer says which one took the money.
--
-- The role is therefore its own column: (accepted_by_role, accepted_by) is the
-- pair that identifies an account anywhere in this system, and the join in
-- models/cashSettlementModel.js uses both. Without it, a handover accepted by
-- sub-admin #3 would be shown - on the employee's screen, the admin panel and
-- the settlement report alike - as accepted by whoever happens to be admin #3.
--
-- Existing rows: every handover accepted before this migration was accepted by
-- the main admin, because nobody else could. The 'admin' default is what those
-- rows already mean, so there is nothing to back-fill.
--
-- @applied-if: column cash_settlements.accepted_by_role

ALTER TABLE cash_settlements
  ADD COLUMN accepted_by_role ENUM('admin', 'subadmin') NOT NULL DEFAULT 'admin' AFTER accepted_by;
