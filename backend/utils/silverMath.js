// The one place rupees are turned into silver and back.
//
// A gram of silver costs more than the amounts people pay in, so an everyday
// payment buys a *fraction* of a gram. At ₹105/g, ₹100 buys
//
//     100 / 105 = 0.952380952... g   ->  0.952381 g  ->  952.381 mg
//
// Rounding that to the two decimals money uses (0.95 g) would quietly keep
// 2.38 mg of the customer's silver on every ₹100 - so grams are carried, and
// must be STORED, to six decimals (one microgram). The matching column type is
//
//     grams DECIMAL(14, 6) NOT NULL
//
// Six decimals is also what a DECIMAL(14,6) round-trips exactly, so what the
// code computes is what the database keeps - no widening or truncation on the
// way in.
//
// Money stays at two decimals (paise), because that is what can actually be
// paid and refunded.
//
// ---------------------------------------------------------------------------
// Storing and showing are two different precisions
// ---------------------------------------------------------------------------
// Six decimals is what is STORED. What is SHOWN is three, because three
// decimals of a gram is exactly milligrams - 1 g = 1000 mg - so one number
// reads as both units at once:
//
//     12.350 g   ->  12 grams and 350 milligrams
//
// That is the only gram format in the system: no switching to "952.381 mg"
// below a gram, no six-decimal tails. Every label a person sees comes from
// formatGrams() so the whole app reads the same way.
//
// The rounding is display-only - the stored value keeps all six decimals, so
// nothing is lost by showing fewer. The one thing to know is that a weight
// under half a milligram shows as "0.000 g"; it is still there in the row, it
// is just too small to write in milligrams.

const GRAM_DECIMALS = 6; // 0.000001 g = 1 microgram - what is stored
const GRAM_DISPLAY_DECIMALS = 3; // 0.001 g = 1 milligram - what is shown
const RUPEE_DECIMALS = 2; // 0.01 rupee = 1 paisa
const RATE_DECIMALS = 6; // matches GRAM_DECIMALS - a rate is not money, it's a reference figure
const MILLIGRAMS_PER_GRAM = 1000;

// Rounds on the decimal string rather than by multiplying, so 1.0000005 can't
// be knocked off by binary floating point before it is rounded.
function roundTo(value, decimals) {
  const number = Number(value);
  if (!Number.isFinite(number)) return NaN;
  return Number(number.toFixed(decimals));
}

// Grams, at storage precision. Use this on every gram figure before it goes
// into the database or into a response.
function roundGrams(grams) {
  return roundTo(grams, GRAM_DECIMALS);
}

// Rupees, at payable precision.
function roundRupees(amount) {
  return roundTo(amount, RUPEE_DECIMALS);
}

// A published buy/sell rate, at storage precision. Unlike a rupee amount, a
// rate never itself changes hands - it's multiplied into every purchase and
// sale of the day, so rounding it to the paisa before storing it would throw
// away precision before it ever reached a calculation.
function roundRatePerGram(rate) {
  return roundTo(rate, RATE_DECIMALS);
}

// "₹100 at ₹105/g" -> 0.952381 g
//
// Returns null when either side isn't a usable number, so a missing rate can
// never silently become 0 g or Infinity g.
function gramsForAmount(amountInRupees, ratePerGram) {
  const amount = Number(amountInRupees);
  const rate = Number(ratePerGram);

  if (!Number.isFinite(amount) || amount < 0) return null;
  if (!Number.isFinite(rate) || rate <= 0) return null;

  return roundGrams(amount / rate);
}

// The other direction: what 0.952381 g is worth at ₹105/g -> ₹100.00
function amountForGrams(grams, ratePerGram) {
  const weight = Number(grams);
  const rate = Number(ratePerGram);

  if (!Number.isFinite(weight) || weight < 0) return null;
  if (!Number.isFinite(rate) || rate <= 0) return null;

  return roundRupees(weight * rate);
}

// 0.952381 g -> 952.381 mg. The relation the display format leans on, kept
// here for anything that needs milligrams as a number of their own.
function gramsToMilligrams(grams) {
  const weight = Number(grams);
  if (!Number.isFinite(weight)) return null;
  return roundTo(weight * MILLIGRAMS_PER_GRAM, GRAM_DECIMALS - 3);
}

// The one gram format in the system - grams before the point, milligrams
// after it:
//   12.35     -> "12.350 g"       0.952381 -> "0.952 g"
// null, undefined and "" are checked explicitly, because Number(null) is 0 and
// 0 is finite - so without this a weight the system does not KNOW would print
// as a confident "0.000 g". The frontend's copy of this function has always
// guarded them; this one had drifted.
function formatGrams(grams) {
  if (grams === null || grams === undefined || grams === "") return "—";

  const weight = Number(grams);
  if (!Number.isFinite(weight)) return "—";

  return `${roundTo(weight, GRAM_DISPLAY_DECIMALS).toFixed(GRAM_DISPLAY_DECIMALS)} g`;
}

module.exports = {
  GRAM_DECIMALS,
  GRAM_DISPLAY_DECIMALS,
  RUPEE_DECIMALS,
  RATE_DECIMALS,
  MILLIGRAMS_PER_GRAM,
  roundGrams,
  roundRupees,
  roundRatePerGram,
  gramsForAmount,
  amountForGrams,
  gramsToMilligrams,
  formatGrams,
};
