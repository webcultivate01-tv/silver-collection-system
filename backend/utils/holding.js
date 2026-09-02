// What a customer holds, in one place.
//
// A holding is a subtraction across two tables - every gram bought, minus
// every gram sold back - and three screens act on it: the customer's portal,
// the counter's buy screen and the counter's sell screen (which uses it as
// the ceiling on what may be sold). Computing it in one place is what keeps
// those three from ever quoting different numbers.
//
// It lives here rather than in a controller because both purchaseController
// and saleController need it, and a controller requiring the other would be a
// cycle.

const SilverPurchaseModel = require("../models/silverPurchaseModel");
const SilverSaleModel = require("../models/silverSaleModel");
const { roundGrams, roundRupees, formatGrams } = require("./silverMath");

// `totalGrams` is what they hold *now* - bought minus sold - because that is
// the only figure anything should act on. The two gross sides ride along for
// the "bought / sold" breakdown, but nothing decides anything from those.
function toHolding(purchaseTotals, saleTotals) {
  const netGrams = roundGrams(purchaseTotals.totalGrams - saleTotals.totalGrams);

  return {
    purchases: purchaseTotals.purchases,
    totalGrams: netGrams,
    gramsLabel: formatGrams(netGrams),
    totalPaid: roundRupees(purchaseTotals.totalPaid),
    lastPurchaseOn: purchaseTotals.lastPurchaseOn,

    boughtGrams: roundGrams(purchaseTotals.totalGrams),
    boughtGramsLabel: formatGrams(purchaseTotals.totalGrams),

    sales: saleTotals.sales,
    soldGrams: roundGrams(saleTotals.totalGrams),
    soldGramsLabel: formatGrams(saleTotals.totalGrams),
    totalReceived: roundRupees(saleTotals.totalPayable),
    lastSaleOn: saleTotals.lastSaleOn,
  };
}

async function loadHolding(userId) {
  const [purchaseTotals, saleTotals] = await Promise.all([
    SilverPurchaseModel.totalsForUser(userId),
    SilverSaleModel.totalsForUser(userId),
  ]);

  return toHolding(purchaseTotals, saleTotals);
}

// The same holding for many customers at once.
//
// The admin's payout screen lists an employee's whole client book with what
// each one holds beside their name, so it needs the figure for fifty people at
// a time. Calling loadHolding() per row would be two queries per customer;
// this is two queries for the lot, and - the part that matters - it builds
// each holding through the very same toHolding() the single-customer path
// uses, so a number in the list can never disagree with the number on the
// screen it links to.
//
// Returns a Map keyed by user id, with an entry for EVERY id asked for -
// customers who have never traded get a zero holding rather than nothing, so
// the caller never has to special-case a missing key.
const EMPTY_PURCHASES = { purchases: 0, totalGrams: 0, totalPaid: 0, lastPurchaseOn: null };
const EMPTY_SALES = { sales: 0, totalGrams: 0, totalPayable: 0, lastSaleOn: null };

async function loadHoldings(userIds = []) {
  const ids = [...new Set(userIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return new Map();

  const [purchaseTotals, saleTotals] = await Promise.all([
    SilverPurchaseModel.totalsForUsers(ids),
    SilverSaleModel.totalsForUsers(ids),
  ]);

  return new Map(
    ids.map((id) => [
      id,
      toHolding(purchaseTotals.get(id) || EMPTY_PURCHASES, saleTotals.get(id) || EMPTY_SALES),
    ])
  );
}

module.exports = { toHolding, loadHolding, loadHoldings };
