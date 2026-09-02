// The browser half of backend/utils/silverMath.js.
//
// The server is what actually prices a purchase - it uses the published rate,
// stores the weight to six decimals and hands the row back. This copy exists
// only so the counter screen can show the employee what an amount buys
// *before* they save it, with exactly the same arithmetic, so the preview and
// the receipt never disagree.
//
// Keep the two files in step.

export const GRAM_DECIMALS = 6; // 0.000001 g = 1 microgram - what is stored
export const GRAM_DISPLAY_DECIMALS = 3; // 0.001 g = 1 milligram - what is shown
const MILLIGRAMS_PER_GRAM = 1000;

function roundTo(value, decimals) {
  const number = Number(value);
  if (!Number.isFinite(number)) return NaN;
  return Number(number.toFixed(decimals));
}

export function roundGrams(grams) {
  return roundTo(grams, GRAM_DECIMALS);
}

// "₹100 at ₹105/g" -> 0.952381 g. Null when either side isn't usable, so a
// missing rate shows nothing rather than 0 g or Infinity.
export function gramsForAmount(amountInRupees, ratePerGram) {
  const amount = Number(amountInRupees);
  const rate = Number(ratePerGram);

  if (!Number.isFinite(amount) || amount < 0) return null;
  if (!Number.isFinite(rate) || rate <= 0) return null;

  return roundGrams(amount / rate);
}

// The other direction, at paise precision: what a holding is worth at a given
// rate. Used to show a customer today's value of the silver they hold.
export function amountForGrams(grams, ratePerGram) {
  const weight = Number(grams);
  const rate = Number(ratePerGram);

  if (!Number.isFinite(weight) || weight < 0) return null;
  if (!Number.isFinite(rate) || rate <= 0) return null;

  return roundTo(weight * rate, 2);
}

export function gramsToMilligrams(grams) {
  const weight = Number(grams);
  if (!Number.isFinite(weight)) return null;
  return roundTo(weight * MILLIGRAMS_PER_GRAM, GRAM_DECIMALS - 3);
}

// The one gram format in the system: three decimals, because three decimals of
// a gram is exactly milligrams (1 g = 1000 mg), so the single number reads as
// both units at once -
//
//     12.350 g  ->  12 grams and 350 milligrams
//
// Display only; the stored value keeps all six decimals.
//   12.35     -> "12.350 g"       0.952381 -> "0.952 g"
export function formatGrams(grams) {
  const weight = Number(grams);
  if (grams === null || grams === undefined || !Number.isFinite(weight)) return "—";

  return `${roundTo(weight, GRAM_DISPLAY_DECIMALS).toFixed(GRAM_DISPLAY_DECIMALS)} g`;
}
