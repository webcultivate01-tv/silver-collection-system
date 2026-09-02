// Selling silver back - the mirror of purchaseController.
//
// A customer walks in with silver in their account rather than cash in their
// hand. The employee picks them, enters how much they want to sell, and:
//
//   * the rate comes from the last rate the admin published - never from the
//     request. It is the customer's SELLING rate, the lower of the two, which
//     is where the shop's margin comes from: they bought at buy_rate_per_gram
//     and sell back at sell_rate_per_gram;
//   * the payout is grams x rate at paise precision, and both the weight and
//     the rate are frozen into the row, so a sale never re-prices itself;
//   * the grams leave the holding immediately - the silver is gone the moment
//     the sale is recorded - but payout_status stays 'pending' until the admin
//     approves the cash going out. That mirrors a purchase waiting on the cash
//     handover, and means no employee can empty the till unseen.
//
// Nobody can sell silver they don't hold: the check and the insert happen
// inside one locked transaction in models/silverSaleModel.js, so two taps on
// "Record Sale" can't spend the same gram twice.

const SilverSaleModel = require("../models/silverSaleModel");
const SilverRateModel = require("../models/silverRateModel");
const { UserModel } = require("../models/accounts");
const { toRate, todayAsDate } = require("./silverRateController");
const { loadHolding } = require("../utils/holding");
const {
  amountForGrams,
  gramsForAmount,
  roundGrams,
  roundRupees,
  formatGrams,
} = require("../utils/silverMath");
const { parseLimit } = require("../utils/requestParams");

// A single payout larger than this is a slipped finger, not a sale.
const MAX_PAYOUT = 10000000; // ₹1,00,00,000
// Below a milligram there is nothing worth paying out.
const MIN_GRAMS = 0.001;

const MAX_ROWS = 200;

// The API speaks camelCase; grams and rupees come back as numbers so the
// frontend doesn't have to parse the DECIMAL strings MySQL returns.
function toSale(row) {
  // Where the payout came from. `recorded_by_admin_id` is the only thing that
  // says so: an admin payout has no employee at the counter, so "employee_id
  // is null" would be a guess, and a guess is not what a cash report should be
  // built on.
  const source = row.recorded_by_admin_id ? "admin" : "counter";

  // What the customer actually walked away with. A coin payout moves no money
  // at all - the rupee figure on the row is what the coin was WORTH on the
  // day, frozen for the record, not cash anybody handed over. Every screen
  // reads this rather than deciding for itself, so the customer's history and
  // the admin's ledger can never describe the same row differently.
  const payoutKind = row.payout_kind === "coin" ? "coin" : "cash";
  const isCoin = payoutKind === "coin";

  return {
    id: row.id,
    userId: row.user_id,
    employeeId: row.employee_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerMobile: row.customer_mobile || null,

    // Who was at the counter. Null on an admin payout - nobody was.
    employeeName: row.employee_name || null,
    employeeCode: row.employee_code || null,

    // The employee this customer belongs to, which every sale has whether or
    // not anyone stood at a counter for it. This is what an "all of Ramesh's
    // payouts" report groups on.
    ownerEmployeeId: row.customer_employee_id || null,
    ownerEmployeeName: row.owner_employee_name || null,
    ownerEmployeeCode: row.owner_employee_code || null,

    grams: roundGrams(row.grams),
    gramsLabel: formatGrams(row.grams),
    ratePerGram: Number(row.rate_per_gram),
    amountPayable: Number(row.amount_payable),
    soldOn: row.sold_on,
    createdAt: row.created_at,

    // 'pending' until an admin approves the payout. An admin payout is born
    // 'paid' - the admin recording it is the admin paying it.
    payoutStatus: row.payout_status || "pending",
    approvedBy: row.approved_by || null,
    approvedByName: row.approved_by_name || null,
    approvedAt: row.approved_at || null,

    payoutKind,
    isCoin,
    // "Silver coin" / "Cash" - the one wording for what was received.
    payoutKindLabel: isCoin ? "Silver coin" : "Cash",

    source,
    recordedByAdminName: row.recorded_by_admin_name || null,

    // "Ramesh" / "Anita (admin)" - one label, so the history table and the
    // downloadable report never word the same thing differently.
    handledBy:
      source === "admin"
        ? row.recorded_by_admin_name
          ? `${row.recorded_by_admin_name} (admin)`
          : "Admin panel"
        : row.employee_name || "—",
  };
}

// The rate a sale is made at: the customer's SELLING rate. Returns null when
// no usable rate has been published. Its mirror is currentBuyRate() in
// purchaseController.
async function currentSellRate() {
  const { latest } = await SilverRateModel.getLatestPair();
  const rate = toRate(latest);

  if (!rate || !(rate.sellRatePerGram > 0)) return null;
  return rate;
}

// Returns { value } or { error }.
//
// The employee may type either side of the trade - "sell 2 g" or "give them
// ₹500" - so an amount is converted to grams here, at the same six decimals
// the row will store. Grams are what leaves the holding either way.
function parseGrams(body, ratePerGram) {
  const wantsAmount =
    body.amountPayable !== undefined && body.amountPayable !== null && body.amountPayable !== "";

  if (wantsAmount) {
    const amount = Number(body.amountPayable);

    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: "Enter how much the customer wants to take out" };
    }

    if (amount > MAX_PAYOUT) {
      return { error: "That payout looks too large - please check it" };
    }

    const grams = gramsForAmount(roundRupees(amount), ratePerGram);

    if (grams === null || grams < MIN_GRAMS) {
      return { error: "That amount is too small to sell a recordable weight" };
    }

    return { value: grams };
  }

  const grams = Number(body.grams);

  if (!Number.isFinite(grams) || grams <= 0) {
    return { error: "Enter how much silver the customer wants to sell" };
  }

  if (grams < MIN_GRAMS) {
    return { error: "The smallest sale is 1 mg" };
  }

  return { value: roundGrams(grams) };
}

// @route GET /api/sales/rate
// What the sell screen needs to show a live "this pays out ₹X" before saving.
async function getSaleRate(req, res) {
  try {
    const rate = await currentSellRate();

    res.json({
      rate,
      ratePerGram: rate ? rate.sellRatePerGram : null,
      isToday: !!rate && String(rate.rateDate).slice(0, 10) === todayAsDate(),
    });
  } catch (error) {
    console.error("getSaleRate failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route POST /api/sales
// Body: { userId, grams }  or  { userId, amountPayable }
async function recordSale(req, res) {
  try {
    const userId = Number(req.body.userId);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "Choose the customer this sale is for" });
    }

    const customer = await UserModel.findById(userId);

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    if (!customer.is_active) {
      return res.status(403).json({
        message: "This customer's account is deactivated, so a sale cannot be recorded.",
      });
    }

    const rate = await currentSellRate();

    if (!rate) {
      return res.status(409).json({
        message: "No silver rate has been published yet, so a sale cannot be priced.",
      });
    }

    const grams = parseGrams(req.body, rate.sellRatePerGram);
    if (grams.error) {
      return res.status(400).json({ message: grams.error });
    }

    const amountPayable = amountForGrams(grams.value, rate.sellRatePerGram);

    if (amountPayable === null || amountPayable <= 0) {
      return res.status(400).json({ message: "That weight does not pay out a recordable amount" });
    }

    // The "do they hold this much" check lives inside this call, under a lock -
    // see models/silverSaleModel.js.
    const { id, available } = await SilverSaleModel.create({
      userId: customer.id,
      employeeId: req.employee ? req.employee.id : null,
      grams: grams.value,
      ratePerGram: rate.sellRatePerGram,
      amountPayable,
      soldOn: todayAsDate(),
    });

    if (!id) {
      return res.status(409).json({
        message:
          available > 0
            ? `${customer.name} only holds ${formatGrams(available)}, so ${formatGrams(
                grams.value
              )} cannot be sold.`
            : `${customer.name} has no silver to sell.`,
        availableGrams: roundGrams(available),
      });
    }

    const [sale, holding] = await Promise.all([
      SilverSaleModel.findById(id),
      loadHolding(customer.id),
    ]);

    res.status(201).json({
      message: `${formatGrams(grams.value)} sold for ${customer.name} — ₹${roundRupees(
        amountPayable
      )} to pay out once the admin approves it.`,
      sale: toSale(sale),
      holding,
    });
  } catch (error) {
    console.error("recordSale failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route GET /api/sales/recorded-by-me
// What this member of staff has bought back at the counter.
async function listMyRecordedSales(req, res) {
  try {
    const limit = parseLimit(req.query.limit, 50, MAX_ROWS);
    const sales = await SilverSaleModel.listForEmployee(req.employee.id, { limit });

    res.json({ sales: sales.map(toSale) });
  } catch (error) {
    console.error("listMyRecordedSales failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route GET /api/sales/my-sales
// The signed-in customer's own sell-back history.
async function getMySales(req, res) {
  try {
    const limit = parseLimit(req.query.limit, 50, MAX_ROWS);

    const [holding, sales] = await Promise.all([
      loadHolding(req.user.id),
      SilverSaleModel.listForUser(req.user.id, { limit }),
    ]);

    res.json({ holding, sales: sales.map(toSale) });
  } catch (error) {
    console.error("getMySales failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route GET /api/sales?status=&search=&from=&to=  (admin + sub-admin)
// The payout queue, and the full sell-back ledger behind it.
async function listAllSales(req, res) {
  try {
    const limit = parseLimit(req.query.limit, 200, MAX_ROWS);
    const search = String(req.query.search || "").trim().slice(0, 80);
    const status = ["pending", "paid"].includes(req.query.status) ? req.query.status : "all";
    const from = String(req.query.from || "").match(/^\d{4}-\d{2}-\d{2}$/) ? req.query.from : "";
    const to = String(req.query.to || "").match(/^\d{4}-\d{2}-\d{2}$/) ? req.query.to : "";

    const employeeId = Number(req.query.employeeId) || null;
    const source = ["admin", "counter"].includes(req.query.source) ? req.query.source : "all";
    const kind = ["coin", "cash"].includes(req.query.kind) ? req.query.kind : "all";

    const filters = { search, status, from, to, employeeId, source, kind };

    // The totals are read with the SAME filters as the rows, so the figures
    // above the table always describe the table below it.
    const [sales, totals] = await Promise.all([
      SilverSaleModel.listAll({ limit, ...filters }),
      SilverSaleModel.totals(filters),
    ]);

    res.json({
      sales: sales.map(toSale),
      totals: {
        ...totals,
        totalGrams: roundGrams(totals.totalGrams),
        gramsLabel: formatGrams(totals.totalGrams),
        paidGrams: roundGrams(totals.paidGrams),
        paidGramsLabel: formatGrams(totals.paidGrams),
        coinGrams: roundGrams(totals.coinGrams),
        coinGramsLabel: formatGrams(totals.coinGrams),
        coinValue: roundRupees(totals.coinValue),
        cashPaid: roundRupees(totals.cashPaid),
        totalPayable: roundRupees(totals.totalPayable),
        pendingPayable: roundRupees(totals.pendingPayable),
        paidPayable: roundRupees(totals.paidPayable),
      },
      filters: { ...filters, limit },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("listAllSales failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route POST /api/sales/:id/approve  (main admin only)
// The admin has counted the cash out: the payout becomes 'paid'.
async function approveSale(req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid sale" });
    }

    const outcome = await SilverSaleModel.approve(id, req.user.id);

    if (outcome === "not_found") {
      return res.status(404).json({ message: "Sale not found" });
    }

    if (outcome === "already_paid") {
      return res.status(409).json({ message: "This payout has already been approved." });
    }

    const sale = await SilverSaleModel.findById(id);

    res.json({
      message: `₹${roundRupees(sale.amount_payable)} payout approved for ${sale.customer_name}`,
      sale: toSale(sale),
    });
  } catch (error) {
    console.error("approveSale failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

module.exports = {
  getSaleRate,
  recordSale,
  // The one definition of "the rate a sell-back is priced at". The admin's
  // payout screen prices from this too, so the counter and the panel can never
  // pay a customer out at two different rates on the same day.
  currentSellRate,
  // The counter's limits on a single sell-back. The admin's payout screen is
  // the same trade made from the other side of the desk, so it must refuse
  // exactly what the counter refuses - shared rather than re-typed, so the two
  // can't drift apart.
  MAX_PAYOUT,
  MIN_GRAMS,
  listMyRecordedSales,
  getMySales,
  listAllSales,
  approveSale,
  // Shared with purchaseController so a sale is shaped identically wherever
  // it's shown.
  toSale,
};
