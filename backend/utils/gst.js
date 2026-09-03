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
// fixed, round figure on the bill, and the 3% is taken back out of it - not
// added on top. So a ₹220 coin is billed at ₹220, GST is 3% of that ₹220, and
// the taxable amount is whatever is left once the tax is taken out.
//
// Everything is worked in whole paisa, not floating rupees, so the three
// pieces always add back up to the total to the exact paisa - there is no
// round-off line to explain on the printed bill.
const { roundRupees } = require("./silverMath");

const SILVER_HSN = "7106";
const CGST_RATE = 1.5;
const SGST_RATE = 1.5;
const GST_RATE = CGST_RATE + SGST_RATE; // 3% total, of `totalAmount`

function toPaisa(rupees) {
  return Math.round(rupees * 100);
}

// CGST and SGST are charged at the same rate, so they always print the same
// value - never a paisa apart. GST is 3% of the total (rounded half-up),
// halved evenly between the two, and the taxable amount is whatever is left
// of the total once both halves are taken out - so it is the taxable amount
// that absorbs the odd paisa when the total doesn't split evenly, not the two
// tax lines.
function taxOnSilver(totalAmount) {
  const total = roundRupees(totalAmount);

  if (!Number.isFinite(total) || total < 0) return null;

  const totalPaisa = toPaisa(total);
  const gstPaisa = Math.round((totalPaisa * GST_RATE) / 100);
  const halfGstPaisa = Math.round(gstPaisa / 2);
  const cgstPaisa = halfGstPaisa;
  const sgstPaisa = halfGstPaisa;
  const taxablePaisa = totalPaisa - cgstPaisa - sgstPaisa;

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
