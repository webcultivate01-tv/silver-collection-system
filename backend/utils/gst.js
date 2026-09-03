// The tax side of a silver bill.
//
// Silver is HSN 7106 and carries 3% GST, charged as two halves within
// Maharashtra: CGST 1.5% to the centre, SGST 1.5% to the state. Both are
// worked out here rather than on a screen, for the same reason every other
// figure on a payout is: the customer signs the printed bill, and the number
// they sign for has to be the number the server computed - not one a browser
// re-derived and rounded a step differently.
//
// GST here is INCLUSIVE: the amount the customer pays (`totalAmount`) is the
// fixed, round figure on the bill, and the 3% is extracted back out of it -
// not added on top. So a ₹220 coin is billed at ₹220, and the taxable amount
// and the two tax halves are whatever divides evenly out of that ₹220.
//
// Everything is worked in whole paisa, not floating rupees, so the three
// pieces always add back up to the total to the exact paisa - there is no
// round-off line to explain on the printed bill.
const { roundRupees } = require("./silverMath");

const SILVER_HSN = "7106";
const CGST_RATE = 1.5;
const SGST_RATE = 1.5;
const GST_RATE = CGST_RATE + SGST_RATE; // 3% total, inclusive in `totalAmount`

function toPaisa(rupees) {
  return Math.round(rupees * 100);
}

// CGST and SGST are not each 1.5% of the taxable amount rounded on their own
// - halved that way, the two can disagree by a paisa from what the total
// minus the taxable amount actually is. Instead the total GST is taken by
// subtraction (so it always ties out against `totalAmount`), CGST takes half
// of it, and SGST takes whatever paisa is left over.
function taxOnSilver(totalAmount) {
  const total = roundRupees(totalAmount);

  if (!Number.isFinite(total) || total < 0) return null;

  const totalPaisa = toPaisa(total);
  const taxablePaisa = Math.round(totalPaisa / (1 + GST_RATE / 100));
  const totalGstPaisa = totalPaisa - taxablePaisa;
  const cgstPaisa = Math.round(totalGstPaisa / 2);
  const sgstPaisa = totalGstPaisa - cgstPaisa;

  const taxableAmount = taxablePaisa / 100;
  const cgstAmount = cgstPaisa / 100;
  const sgstAmount = sgstPaisa / 100;
  const gstIncludeAmount = total;

  return {
    hsn: SILVER_HSN,
    taxableAmount,
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
