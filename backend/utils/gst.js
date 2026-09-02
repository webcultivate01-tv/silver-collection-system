// The tax side of a silver bill.
//
// Silver is HSN 7106 and carries 3% GST, charged as two halves within
// Maharashtra: CGST 1.5% to the centre, SGST 1.5% to the state. Both are
// worked out here rather than on a screen, for the same reason every other
// figure on a payout is: the customer signs the printed bill, and the number
// they sign for has to be the number the server computed - not one a browser
// re-derived and rounded a step differently.
//
// The coin's value at the published rate is the TAXABLE amount, and the two
// taxes go on top of it. So a coin worth ₹194 is billed at ₹200, not ₹194 -
// the published rate is a metal rate, not a counter price.
//
// The tax itself is rounded to the whole rupee, not the paisa. That is what
// section 170 of the CGST Act asks for, and it is what makes the bill add up
// in front of the customer with no round-off line to explain: ₹194 taxable
// carries ₹3 and ₹3, and the total is ₹200 exactly.

const { roundRupees } = require("./silverMath");

const SILVER_HSN = "7106";
const CGST_RATE = 1.5;
const SGST_RATE = 1.5;

// Each half is rounded on its own, because that is how each is reported and
// paid - not halved off a single rounded 3% figure, which can leave the two
// halves disagreeing on the printed bill.
function taxOnSilver(taxableAmount) {
  const taxable = roundRupees(taxableAmount);

  if (!Number.isFinite(taxable) || taxable < 0) return null;

  const cgstAmount = Math.round((taxable * CGST_RATE) / 100);
  const sgstAmount = Math.round((taxable * SGST_RATE) / 100);
  const gstIncludeAmount = roundRupees(taxable + cgstAmount + sgstAmount);

  return {
    hsn: SILVER_HSN,
    taxableAmount: taxable,
    cgstRate: CGST_RATE,
    cgstAmount,
    sgstRate: SGST_RATE,
    sgstAmount,
    gstIncludeAmount,

    // The same figure. Both lines are printed because the shop's bill has
    // always printed both, and a customer looking for "Total Amount" should
    // find it - but there is nothing between them to reconcile.
    totalAmount: gstIncludeAmount,
  };
}

module.exports = { SILVER_HSN, CGST_RATE, SGST_RATE, taxOnSilver };
