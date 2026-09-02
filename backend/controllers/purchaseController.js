// Recording what a customer buys.
//
// An employee takes the money at the counter and enters two things: which
// customer, and how many rupees. Everything else is worked out here:
//
//   * the rate comes from the last rate the admin published - never from the
//     request, so a hand-made API call can't buy silver at ₹1 a gram. It is
//     the BUYING rate: the two rates the admin publishes are named from the
//     customer's side, so they buy at buy_rate_per_gram and sell back at the
//     lower sell_rate_per_gram (see controllers/saleController.js);
//   * the weight is amount / rate at six decimals (see utils/silverMath),
//     because a payment usually buys a fraction of a gram - ₹100 at ₹105/g is
//     0.952381 g, i.e. 952.381 mg;
//   * both are written into the row and never recalculated, so the customer's
//     holding doesn't move when tomorrow's rate does.
//
// The customer is a row in `users`; a customer only ever reads their own
// history.
//
// An employee reaches only the users they registered themselves. The picker,
// the holding lookup and the insert all go through loadMyCustomer() (see
// utils/customerAccess.js) - the same ownership rule the employee panel's User
// Management enforces - so a user another employee added is not listed, not
// readable, and cannot be bought for, whether the request comes from the UI or
// from a hand-made API call with a guessed id.

const SilverPurchaseModel = require("../models/silverPurchaseModel");
const SilverSaleModel = require("../models/silverSaleModel");
const SilverRateModel = require("../models/silverRateModel");
const ManagedUserModel = require("../models/managedUserModel");
const { toRate, todayAsDate } = require("./silverRateController");
const { toSale } = require("./saleController");
const { loadHolding } = require("../utils/holding");
const { loadMyCustomer } = require("../utils/customerAccess");
const { gramsForAmount, roundGrams, roundRupees, formatGrams } = require("../utils/silverMath");
const { parseDate, parseLimit } = require("../utils/requestParams");

// One payment larger than this is a slipped finger on the keypad, not a sale.
const MAX_AMOUNT = 10000000; // ₹1,00,00,000
const MIN_AMOUNT = 1;

const MAX_ROWS = 200;

// The API speaks camelCase; grams comes back as a number so the frontend does
// not have to parse the DECIMAL string MySQL returns.
function toPurchase(row) {
  return {
    id: row.id,
    userId: row.user_id,
    employeeId: row.employee_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    employeeName: row.employee_name || null,
    employeeCode: row.employee_code || null,
    amountPaid: Number(row.amount_paid),
    ratePerGram: Number(row.rate_per_gram),
    grams: roundGrams(row.grams),
    gramsLabel: formatGrams(row.grams),
    purchasedOn: row.purchased_on,
    createdAt: row.created_at,
    // 'pending' until the cash handover carrying this purchase is accepted
    // by the admin - see settlementController.
    paymentStatus: row.payment_status || "pending",
    settlementId: row.settlement_id || null,
  };
}

// Returns { value } or { error }.
function parseAmount(raw) {
  const value = Number(raw);

  if (!Number.isFinite(value) || value <= 0) {
    return { error: "Enter the amount the customer paid" };
  }

  if (value < MIN_AMOUNT) {
    return { error: `The smallest purchase is ₹${MIN_AMOUNT}` };
  }

  if (value > MAX_AMOUNT) {
    return { error: "That amount looks too large - please check it" };
  }

  // Money is paid in paise, so anything finer is not a real payment.
  return { value: roundRupees(value) };
}

// The rate a purchase is made at: the customer's BUYING rate, the higher of
// the two the admin publishes. Returns null when no usable rate has been
// published. Its mirror is currentSellRate() in saleController.
async function currentBuyRate() {
  const { latest } = await SilverRateModel.getLatestPair();
  const rate = toRate(latest);

  if (!rate || !(rate.buyRatePerGram > 0)) return null;
  return rate;
}

// @route GET /api/purchases/rate
// What the counter screen needs to show a live "this buys X" before saving.
async function getPurchaseRate(req, res) {
  try {
    const rate = await currentBuyRate();

    res.json({
      rate,
      ratePerGram: rate ? rate.buyRatePerGram : null,
      isToday: !!rate && String(rate.rateDate).slice(0, 10) === todayAsDate(),
    });
  } catch (error) {
    console.error("getPurchaseRate failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route GET /api/purchases/customers?search=
// The customer picker on the counter screen: the users this employee
// registered, and only those. Deactivated accounts are left out - a purchase
// can't be recorded against one anyway.
async function listCustomers(req, res) {
  try {
    const search = String(req.query.search || "").trim().slice(0, 80);
    const customers = await ManagedUserModel.findAll({
      employeeId: req.employee.id,
      search,
      status: "active",
    });

    res.json({
      customers: customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        email: customer.email,
      })),
    });
  } catch (error) {
    console.error("listCustomers failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route GET /api/purchases/customers/:userId
// One customer's holding and history, for the employee about to serve them.
// Somebody else's user is "not found" here, exactly as it is in the panel.
async function getCustomerHolding(req, res) {
  try {
    const customer = await loadMyCustomer(req, res, req.params.userId);
    if (!customer) return;

    const [holding, purchases, sales] = await Promise.all([
      loadHolding(customer.id),
      SilverPurchaseModel.listForUser(customer.id, { limit: 50 }),
      SilverSaleModel.listForUser(customer.id, { limit: 50 }),
    ]);

    res.json({
      customer: { id: customer.id, name: customer.name, email: customer.email },
      holding,
      purchases: purchases.map(toPurchase),
      sales: sales.map(toSale),
    });
  } catch (error) {
    console.error("getCustomerHolding failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route POST /api/purchases
// Body: { userId, amountPaid }
async function recordPurchase(req, res) {
  try {
    const userId = Number(req.body.userId);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "Choose the customer this purchase is for" });
    }

    const amount = parseAmount(req.body.amountPaid);
    if (amount.error) {
      return res.status(400).json({ message: amount.error });
    }

    const customer = await loadMyCustomer(req, res, userId);
    if (!customer) return;

    if (!customer.is_active) {
      return res.status(403).json({
        message: "This customer's account is deactivated, so a purchase cannot be recorded.",
      });
    }

    const rate = await currentBuyRate();

    if (!rate) {
      return res.status(409).json({
        message: "No silver rate has been published yet, so a purchase cannot be priced.",
      });
    }

    const grams = gramsForAmount(amount.value, rate.buyRatePerGram);

    if (grams === null || grams <= 0) {
      return res.status(400).json({ message: "That amount does not buy a recordable weight" });
    }

    const id = await SilverPurchaseModel.create({
      userId: customer.id,
      employeeId: req.employee ? req.employee.id : null,
      amountPaid: amount.value,
      ratePerGram: rate.buyRatePerGram,
      grams,
      purchasedOn: todayAsDate(),
    });

    const [purchase, holding] = await Promise.all([
      SilverPurchaseModel.findById(id),
      loadHolding(customer.id),
    ]);

    res.status(201).json({
      message: `${formatGrams(grams)} recorded for ${customer.name}`,
      purchase: toPurchase(purchase),
      holding,
    });
  } catch (error) {
    console.error("recordPurchase failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route GET /api/purchases/recorded-by-me
// What this member of staff has taken at the counter.
async function listMyRecordedPurchases(req, res) {
  try {
    const limit = parseLimit(req.query.limit, 50, MAX_ROWS);
    const purchases = await SilverPurchaseModel.listForEmployee(req.employee.id, { limit });

    res.json({ purchases: purchases.map(toPurchase) });
  } catch (error) {
    console.error("listMyRecordedPurchases failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route GET /api/purchases/my-holding
// The signed-in customer's own silver: how much they hold and how they got it.
async function getMyHolding(req, res) {
  try {
    const limit = parseLimit(req.query.limit, 50, MAX_ROWS);

    const [holding, purchases, sales] = await Promise.all([
      loadHolding(req.user.id),
      SilverPurchaseModel.listForUser(req.user.id, { limit }),
      SilverSaleModel.listForUser(req.user.id, { limit }),
    ]);

    res.json({
      holding,
      purchases: purchases.map(toPurchase),
      sales: sales.map(toSale),
    });
  } catch (error) {
    console.error("getMyHolding failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route GET /api/purchases  (admin + sub-admin)
async function listAllPurchases(req, res) {
  try {
    const limit = parseLimit(req.query.limit, 200, MAX_ROWS);
    const search = String(req.query.search || "").trim().slice(0, 80);
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);

    // The same filters go to both, so the headline figures always describe the
    // rows below them.
    const filters = { search, from, to };

    const [purchases, totals] = await Promise.all([
      SilverPurchaseModel.listAll({ limit, ...filters }),
      SilverPurchaseModel.totals(filters),
    ]);

    res.json({
      purchases: purchases.map(toPurchase),
      totals: {
        ...totals,
        totalGrams: roundGrams(totals.totalGrams),
        gramsLabel: formatGrams(totals.totalGrams),
        totalPaid: roundRupees(totals.totalPaid),
      },
      filters: { search, from, to, limit },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("listAllPurchases failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

module.exports = {
  getPurchaseRate,
  listCustomers,
  getCustomerHolding,
  recordPurchase,
  listMyRecordedPurchases,
  getMyHolding,
  listAllPurchases,
  // Shared with settlementController so a bundled purchase is shaped
  // identically wherever it's shown.
  toPurchase,
};
