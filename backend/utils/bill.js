// The tax invoice side of a silver coin payout.
//
// Two screens print this bill and they must print the same piece of paper:
//
//   the payout flow    the moment the coin is handed over, off the report
//                      POST /api/payouts returns;
//   the payout history GET /api/sales/:id/bill, months later, when the
//                      customer has lost their copy or the shop needs the
//                      invoice again for its GST return.
//
// A reprint is not a new bill. It carries the ORIGINAL bill number, the
// original date and time, and the figures frozen into the silver_sales row on
// the day - never today's rate and never a fresh number. A tax invoice that
// came back different the second time it was printed would be two invoices for
// one sale, which is the one thing the bill book must never contain.
//
// Nothing here re-prices anything: the weight, the rate and the coin's value
// are read straight out of the recorded row, and the tax is utils/gst.js's,
// the same function the payout itself billed through.

const { taxOnSilver } = require("./gst");
const { formatGrams, roundGrams } = require("./silverMath");

// The number printed on the tax invoice. It is the silver_sales row's own id,
// so the bill book and the ledger are the same sequence and neither can drift
// from the other - there is nothing to keep in step because there is only one
// counter.
function billNumberFor(saleId) {
  return `SSS-${String(saleId).padStart(5, "0")}`;
}

// The bill for a payout that has already been made, rebuilt from the ledger.
//
// `sale` is a silver_sales row (models/silverSaleModel.js) and `user` the
// customer it belongs to - the row alone cannot fill the "Bill To" box, which
// prints the address, and the address lives on the user.
//
// The shape matches what POST /api/payouts returns, so the same frontend
// renderer draws both and a reprint cannot come to be laid out differently
// from the copy the customer signed.
function billForSale(sale, user) {
  const grams = roundGrams(sale.grams);
  const amountPayable = Number(sale.amount_payable);

  return {
    billNo: billNumberFor(sale.id),

    // The date the coin was handed over, and the time it was recorded at - not
    // the moment this reprint was asked for. The customer's copy and this one
    // are the same document, so they carry the same clock.
    payoutDate: sale.sold_on,
    generatedAt: sale.created_at,

    // Only what the bill prints. This is not the customer record - a tax
    // invoice needs a name, a phone number and an address, and carrying more
    // than that would be handing out the rest of their file with it.
    customer: {
      id: sale.user_id,
      name: user?.name || sale.customer_name,
      email: user?.email || sale.customer_email || null,
      mobile: user?.mobile || sale.customer_mobile || null,
      address: user?.address || null,
    },

    payout: {
      grams,
      gramsLabel: formatGrams(sale.grams),
      ratePerGram: Number(sale.rate_per_gram),
      // What the coin was worth at the rate published that day. No cash moved.
      value: amountPayable,
      amountPayable,
      kind: "coin",
    },

    // The coin's value is the taxable amount; CGST and SGST go on top of it.
    tax: taxOnSilver(amountPayable),
  };
}

module.exports = { billNumberFor, billForSale };
