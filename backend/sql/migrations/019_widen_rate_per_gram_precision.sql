-- Silver rates were stored to the paisa (2 decimals), same as money. But a
-- rate is not money changing hands - it is a reference figure multiplied into
-- every purchase and sale of the day, so rounding it off at 2 decimals threw
-- away precision before it ever reached a calculation. Grams already carry
-- six decimals for the matching reason (see backend/utils/silverMath.js);
-- rates now do too.
--
-- No @applied-if marker: the columns already exist under the old precision,
-- so a column-existence check would wrongly mark this as already done and
-- skip the widening. MODIFY COLUMN to the same type is a harmless no-op, so
-- this is safe to run once against every database regardless of which
-- precision it currently has.

ALTER TABLE silver_rates
  MODIFY COLUMN buy_rate_per_gram  DECIMAL(14, 6) NOT NULL DEFAULT 0,
  MODIFY COLUMN sell_rate_per_gram DECIMAL(14, 6) NOT NULL DEFAULT 0;

ALTER TABLE silver_purchases
  MODIFY COLUMN rate_per_gram DECIMAL(14, 6) NOT NULL;

ALTER TABLE silver_sales
  MODIFY COLUMN rate_per_gram DECIMAL(14, 6) NOT NULL;
