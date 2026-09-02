-- A day's rate is now two per-gram figures - what the shop buys at and what it
-- sells at - instead of one published rate.
--
-- The single rate (with its per-10-gram and per-kg derivations) and the
-- free-text note go away: the admin panel asks for exactly two numbers.
--
-- @applied-if: column silver_rates.buy_rate_per_gram

ALTER TABLE silver_rates
  ADD COLUMN buy_rate_per_gram  DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER rate_date,
  ADD COLUMN sell_rate_per_gram DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER buy_rate_per_gram;

-- Older days had one rate for both sides, so carry it into both columns - the
-- history stays readable instead of showing zeroes.
UPDATE silver_rates
SET buy_rate_per_gram  = rate_per_gram,
    sell_rate_per_gram = rate_per_gram
WHERE buy_rate_per_gram = 0;

ALTER TABLE silver_rates
  DROP COLUMN rate_per_gram,
  DROP COLUMN rate_per_10gram,
  DROP COLUMN rate_per_kg,
  DROP COLUMN note;
