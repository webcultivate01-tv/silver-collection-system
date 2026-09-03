// Paying a customer's silver out from the admin panel.
//
// The flow the admin walks, and what each step is for:
//
//   1. pick an EMPLOYEE          GET  /api/payouts/employees
//   2. pick one of THEIR USERS   GET  /api/payouts/employees/:id/users
//   3. see what that user holds  GET  /api/payouts/users/:id
//   4. generate the REPORT       POST /api/payouts/report
//   5. confirm the PAYMENT       POST /api/payouts
//
// Steps 1-4 are reads. Nothing changes until step 5, and step 5 is the only
// function in this file that writes.
//
// ---------------------------------------------------------------------------
// A payout here is a SILVER COIN, not money
// ---------------------------------------------------------------------------
// Nothing in this file pays anybody cash. The admin enters the weight of a
// silver coin, hands the customer that coin, and the same weight comes off
// their holding. The silver stops being a balance in an account and becomes an
// object in their pocket.
//
// The rupee figure on every payout is therefore a VALUATION, not a debt: what
// the coin was worth at the rate published that day, frozen into the row so
// the day can be reconciled and so the customer can see what their coin was
// valued at. It is never described as cash, on any screen, to anybody. The
// row records it as payout_kind = 'coin' (migration 015) rather than leaving
// it to be inferred.
//
// ---------------------------------------------------------------------------
// Why this is a row in silver_sales and not a table of its own
// ---------------------------------------------------------------------------
// Handing a coin over IS the customer's silver leaving their account - the
// same event the counter records when it buys silver back, settled in metal
// instead of money. There is one ledger for that, and it has to stay one: the
// check
// that stops a customer being paid out more silver than they hold is a lock
// over silver_purchases and silver_sales, and a second table would be
// invisible to it. Two ledgers would mean the same gram could be paid out
// twice, once from each screen, with both checks satisfied.
//
// So an admin payout is a silver_sales row with employee_id NULL,
// recorded_by_admin_id set, and payout_status already 'paid' - see
// migration 014 and models/silverSaleModel.js#create.
//
// ---------------------------------------------------------------------------
// The report is not decoration - it is the thing that gets paid
// ---------------------------------------------------------------------------
// Step 4 returns a `reference`, and step 5 will not run without one. That ties
// the coin to the piece of paper in three ways that each close a real hole:
//
//   the RATE      the report values the coin at the rate published when it was
//                 generated. If the rate changes between the report and the
//                 handover, step 5 refuses rather than recording a value the
//                 report doesn't show. The admin regenerates and sees the new
//                 figures first.
//
//   the WEIGHT    the coin's weight is what leaves the account, and it is the
//                 admin's own number - so what the report shows and what the
//                 ledger records are the same figure, never one derived from
//                 the other.
//
//   the REPEAT    the reference is unique in the database. A double click, a
//                 refresh mid-submit or a retried request finds the payout it
//                 already made and returns it, instead of taking a second
//                 coin's worth off the customer's holding. Overdrawing is
//                 caught by the holding lock; deducting the same valid weight
//                 twice is not, and this is what catches that.

const crypto = require("crypto");

const ManagedUserModel = require("../models/managedUserModel");
const SilverSaleModel = require("../models/silverSaleModel");
const { loadHolding, loadHoldings } = require("../utils/holding");
const { taxOnSilver } = require("../utils/gst");
// The bill number, and the invoice itself, live in one place - shared with the
// reprint at GET /api/sales/:id/bill, so the copy the customer signed and the
// one printed from the history a year later are the same document.
const { billNumberFor } = require("../utils/bill");
const { todayAsDate } = require("./silverRateController");
const { currentSellRate, toSale, MAX_PAYOUT, MIN_GRAMS } = require("./saleController");
const {
  amountForGrams,
  roundGrams,
  roundRupees,
  formatGrams,
} = require("../utils/silverMath");

const RUPEE = "₹";

// A rate is compared to the paise, because that is the precision it is stored
// and published at. Anything finer would be comparing noise.
function sameRate(a, b) {
  return roundRupees(a) === roundRupees(b);
}

// -------------------------------------------------------------------------
// Step 1 - the employees
// -------------------------------------------------------------------------

// @route GET /api/payouts/employees
// Every employee with their client book: how many users, and how much silver
// those users hold between them.
async function listEmployees(req, res) {
  try {
    const rows = await ManagedUserModel.silverByEmployee();

    const employees = rows.map((row) => {
      const held = roundGrams(Number(row.bought_grams) - Number(row.sold_grams));

      return {
        id: row.id,
        employeeCode: row.employee_code,
        fullName: row.full_name,
        isBlocked: !!row.is_blocked,
        users: Number(row.users) || 0,
        activeUsers: Number(row.active_users) || 0,
        heldGrams: held,
        heldGramsLabel: formatGrams(held),
      };
    });

    res.json({ employees });
  } catch (error) {
    console.error("listEmployees failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// -------------------------------------------------------------------------
// Step 2 - that employee's users
// -------------------------------------------------------------------------

// @route GET /api/payouts/employees/:employeeId/users?search=
// The employee's client book, each with what they hold right now. Holdings are
// read for the whole list in one pair of queries (see utils/holding.js), not
// one pair per row.
async function listEmployeeUsers(req, res) {
  try {
    const employeeId = Number(req.params.employeeId);

    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      return res.status(400).json({ message: "Choose an employee first" });
    }

    const search = String(req.query.search || "").trim().slice(0, 80);
    const rows = await ManagedUserModel.findAll({ employeeId, search, status: "all" });
    const holdings = await loadHoldings(rows.map((row) => row.id));

    const users = rows.map((row) => {
      const holding = holdings.get(row.id);

      return {
        id: row.id,
        name: row.name,
        email: row.email,
        mobile: row.mobile,
        profileImage: row.profile_image,
        isActive: !!row.is_active,
        createdAt: row.created_at,
        holding,
        // The two questions the admin is scanning this list for: is there
        // anything to pay out, and am I allowed to pay it?
        canPayout: !!row.is_active && holding.totalGrams >= MIN_GRAMS,
      };
    });

    // The book's own total, summed from the rows on screen rather than computed
    // separately - a header figure that can disagree with the list beneath it is
    // worse than no header figure.
    const heldGrams = roundGrams(
      users.reduce((sum, user) => sum + Number(user.holding.totalGrams), 0)
    );

    res.json({
      users,
      totals: {
        users: users.length,
        withSilver: users.filter((user) => user.holding.totalGrams >= MIN_GRAMS).length,
        heldGrams,
        heldGramsLabel: formatGrams(heldGrams),
      },
    });
  } catch (error) {
    console.error("listEmployeeUsers failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// -------------------------------------------------------------------------
// Step 3 - one user's silver
// -------------------------------------------------------------------------

function toCustomer(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    // Printed in the "Bill To" box of the tax invoice, so it is carried even
    // though no screen in the payout flow shows it.
    address: user.address || null,
    profileImage: user.profile_image,
    isActive: !!user.is_active,
    employeeId: user.created_by_employee_id,
    employeeName: user.employee_name || null,
    employeeCode: user.employee_code || null,
  };
}

// The published rate, plus whether it is today's. A payout priced off an older
// rate is allowed - the shop may simply not have published yet - but the admin
// has to be able to SEE it before handing a coin over, because it is the rate
// the coin's recorded value is worked out at.
function toRateView(rate) {
  if (!rate) return null;

  return {
    ratePerGram: rate.sellRatePerGram,
    rateDate: rate.rateDate,
    isToday: String(rate.rateDate).slice(0, 10) === todayAsDate(),
  };
}

// @route GET /api/payouts/users/:userId
// What this customer holds, what it is worth today, and every payout they have
// had before - the screen the admin decides the amount on.
async function getUserPayoutView(req, res) {
  try {
    const userId = Number(req.params.userId);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "Invalid user" });
    }

    const user = await ManagedUserModel.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const [holding, rate, sales] = await Promise.all([
      loadHolding(user.id),
      currentSellRate(),
      SilverSaleModel.listForUser(user.id, { limit: 50 }),
    ]);

    // What the whole holding is worth today, so the admin sees the ceiling
    // before typing anything. Null when no rate has ever been published.
    const holdingValue = rate ? amountForGrams(holding.totalGrams, rate.sellRatePerGram) : null;

    res.json({
      customer: toCustomer(user),
      holding,
      rate: toRateView(rate),
      holdingValue,
      payouts: sales.map(toSale),
    });
  } catch (error) {
    console.error("getUserPayoutView failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// -------------------------------------------------------------------------
// Step 4 - the report
// -------------------------------------------------------------------------

// The weight of the coin the admin is about to hand over, typed by them.
// Returns { value } or { error }.
//
// Grams is the only way in. At the counter an employee may type rupees,
// because a customer there asks for money and the silver is worked out from
// it. Nothing is worked out here: the admin is holding a physical coin and
// entering what it weighs. Offering a rupee box would invite them to type an
// amount and let the system pick a weight, and the coin in their hand does not
// change weight to match.
//
// The rupee ceiling still applies, against what the coin is WORTH at today's
// rate - a coin worth more than a crore is a slipped decimal point, whichever
// screen it was typed on.
function parseCoinGrams(body, ratePerGram) {
  const grams = Number(body.grams);

  if (!Number.isFinite(grams) || grams <= 0) {
    return { error: "Enter the weight of the silver coin" };
  }

  if (grams < MIN_GRAMS) {
    return { error: "The smallest coin that can be recorded is 1 mg" };
  }

  const worth = amountForGrams(roundGrams(grams), ratePerGram);

  if (worth === null || worth > MAX_PAYOUT) {
    return { error: "That coin looks too heavy - please check the weight" };
  }

  return { value: roundGrams(grams) };
}

// The report itself: had, paying out, remaining - and the rate all three are
// read against. Built here so step 4 and step 5 return the identical shape,
// and the receipt the admin keeps says exactly what the ledger recorded.
function buildReport({ user, holding, rate, grams, amountPayable, reference, billNo = null }) {
  const remainingGrams = roundGrams(holding.totalGrams - grams);

  return {
    reference,

    // The tax invoice's own number. Null on a proposal: a bill number belongs
    // to a coin that has actually been handed over, and issuing one for a quote
    // the admin may never confirm would put gaps in the bill book.
    billNo,
    generatedAt: new Date().toISOString(),
    payoutDate: todayAsDate(),

    customer: toCustomer(user),
    rate: toRateView(rate),

    // What they had before this payout.
    before: {
      grams: holding.totalGrams,
      gramsLabel: holding.gramsLabel,
      value: amountForGrams(holding.totalGrams, rate.sellRatePerGram),
      boughtGramsLabel: holding.boughtGramsLabel,
      soldGramsLabel: holding.soldGramsLabel,
      totalPaid: holding.totalPaid,
      totalReceived: holding.totalReceived,
    },

    // The coin being handed over. `amountPayable` is what it is WORTH at the
    // rate above - it is recorded so the day can be reconciled and so the
    // customer can see what their coin was valued at, but no money moves. The
    // customer receives the coin, not the sum.
    payout: {
      grams,
      gramsLabel: formatGrams(grams),
      ratePerGram: rate.sellRatePerGram,
      // The coin's value on the day. Not cash owed, and never shown as such.
      value: amountPayable,
      amountPayable,
      kind: "coin",
    },

    // The printed bill, worked out here so the paper and the ledger can never
    // round differently. `amountPayable` is the total the customer pays, and
    // the 3% GST is extracted back out of it, inclusive - see utils/gst.js.
    tax: taxOnSilver(amountPayable),

    // What stays in the account afterwards. This is the number the customer
    // cares about most, so it is computed here once and shown everywhere -
    // never re-derived on a screen, where it could drift.
    after: {
      grams: remainingGrams,
      gramsLabel: formatGrams(remainingGrams),
      value: amountForGrams(remainingGrams, rate.sellRatePerGram),
      // "This empties their account" is worth saying in words rather than
      // leaving the reader to notice a zero.
      clearsAccount: remainingGrams < MIN_GRAMS,
    },
  };
}

// Validates a payout request as far as it can be validated without writing:
// the customer, the rate, the weight and the holding. Returns { error } or
// everything the report and the write both need.
//
// Shared by step 4 and step 5, so a report that generated cleanly cannot then
// be refused by a rule the report never applied - and, more to the point, a
// payment can never skip a check the report happened to make.
async function prepare(body) {
  const userId = Number(body.userId);

  if (!Number.isInteger(userId) || userId <= 0) {
    return { error: { status: 400, message: "Choose the customer to pay out" } };
  }

  const user = await ManagedUserModel.findById(userId);

  if (!user) {
    return { error: { status: 404, message: "Customer not found" } };
  }

  if (!user.is_active) {
    return {
      error: {
        status: 403,
        message: "This customer's account is deactivated, so a payout cannot be made.",
      },
    };
  }

  const rate = await currentSellRate();

  if (!rate) {
    return {
      error: {
        status: 409,
        message:
          "No silver rate has been published yet, so a payout cannot be priced. " +
          "Publish today's rate first.",
      },
    };
  }

  const holding = await loadHolding(user.id);

  if (holding.totalGrams < MIN_GRAMS) {
    return { error: { status: 409, message: `${user.name} has no silver to pay out.` } };
  }

  const grams = parseCoinGrams(body, rate.sellRatePerGram);

  if (grams.error) {
    return { error: { status: 400, message: grams.error } };
  }

  // Checked here so the admin is told before committing to anything. It is
  // checked AGAIN under a lock when the payout is written, which is what
  // actually prevents an overdraw - this one only makes the refusal readable.
  if (grams.value > holding.totalGrams) {
    return {
      error: {
        status: 409,
        message: `${user.name} holds only ${holding.gramsLabel}, so ${formatGrams(
          grams.value
        )} cannot be paid out.`,
        availableGrams: holding.totalGrams,
      },
    };
  }

  const amountPayable = amountForGrams(grams.value, rate.sellRatePerGram);

  if (amountPayable === null || amountPayable <= 0) {
    return {
      error: { status: 400, message: "That weight is too small to record a coin for" },
    };
  }

  return { user, rate, holding, grams: grams.value, amountPayable };
}

// @route POST /api/payouts/report
// Body: { userId, grams }  - grams is the weight of the coin
//
// A pure read. Generating a report never moves silver or money - the admin can
// generate as many as they like, and only the one they confirm is ever paid.
async function generateReport(req, res) {
  try {
    const prepared = await prepare(req.body);

    if (prepared.error) {
      const { status, ...rest } = prepared.error;
      return res.status(status).json(rest);
    }

    const report = buildReport({
      ...prepared,
      // Issued here, spent in step 5. A fresh report gets a fresh reference, so
      // changing the amount and regenerating can never pay the old one.
      reference: crypto.randomUUID(),
    });

    res.json({ report });
  } catch (error) {
    console.error("generateReport failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// -------------------------------------------------------------------------
// Step 5 - the payment
// -------------------------------------------------------------------------

// @route POST /api/payouts
// Body: { userId, grams, ratePerGram, reference }
//
// All four come from the report the admin is looking at, and all four are
// re-checked here: the report is the admin's copy, not the server's memory, so
// nothing in it is taken on trust.
async function payOut(req, res) {
  try {
    const reference = String(req.body.reference || "").trim();

    if (!reference || reference.length > 64) {
      return res.status(400).json({
        message: "Generate the payout report first, then confirm the payment.",
      });
    }

    const prepared = await prepare(req.body);

    if (prepared.error) {
      const { status, ...rest } = prepared.error;
      return res.status(status).json(rest);
    }

    const { user, rate, grams, amountPayable } = prepared;

    // The rate moved between the report and this click. Refuse rather than pay
    // a coin whose recorded value the report doesn't show: the customer is about
    // to sign for that piece of paper, and it has to be right.
    const quoted = Number(req.body.ratePerGram);

    if (Number.isFinite(quoted) && !sameRate(quoted, rate.sellRatePerGram)) {
      return res.status(409).json({
        message:
          `The silver rate changed from ${RUPEE}${roundRupees(quoted)} to ${RUPEE}${roundRupees(
            rate.sellRatePerGram
          )} per gram while this report was open. ` +
          "Generate the report again to see the new payout before paying.",
        ratePerGram: rate.sellRatePerGram,
        staleRate: true,
      });
    }

    const { id, duplicate } = await SilverSaleModel.create({
      userId: user.id,
      employeeId: null, // nobody was at the counter for this one
      recordedByAdminId: req.user.id,
      grams,
      ratePerGram: rate.sellRatePerGram,
      amountPayable,
      soldOn: todayAsDate(),
      // No cash leaves the till - the customer is handed a silver coin of this
      // exact weight.
      payoutKind: "coin",
      // The admin recording this payout is the admin paying it, so it is written
      // 'paid' and approved in the same transaction rather than queued behind an
      // approval that has already happened.
      payoutStatus: "paid",
      approvedBy: req.user.id,
      requestId: reference,
    });

    // Somebody sold this customer's silver between the report and now.
    if (!id) {
      const fresh = await loadHolding(user.id);

      return res.status(409).json({
        message:
          `${user.name} now holds only ${fresh.gramsLabel} - less than the ` +
          `${formatGrams(grams)} on this report. Generate the report again.`,
        availableGrams: fresh.totalGrams,
      });
    }

    const [sale, after] = await Promise.all([
      SilverSaleModel.findById(id),
      loadHolding(user.id),
    ]);

    // The same reference arriving twice. Saying so plainly beats a silent
    // success that leaves the admin wondering whether they paid once or twice.
    if (duplicate) {
      return res.status(200).json({
        alreadyPaid: true,
        message:
          `This payout has already been made - a ${formatGrams(sale.grams)} silver coin to ` +
          `${sale.customer_name}. No second coin has been given.`,
        payout: toSale(sale),
        holding: after,
      });
    }

    // The receipt is built from the holding as it stands NOW, with the payout
    // added back on to get the "before" figure - not from the holding read
    // during validation. Those two are the same number almost always, and differ
    // exactly when they matter: if a purchase landed for this customer between
    // the report and the payment, the report's "before" is already out of date,
    // and a receipt that says the wrong opening balance is a receipt that will
    // not reconcile. Reading it back after the write is the only version that
    // matches the ledger.
    const beforeGrams = roundGrams(after.totalGrams + grams);
    const beforeHolding = { ...after, totalGrams: beforeGrams, gramsLabel: formatGrams(beforeGrams) };

    res.status(201).json({
      message:
        `${formatGrams(grams)} silver coin given to ${user.name}, worth ` +
        `${RUPEE}${roundRupees(amountPayable)} at today's rate. ` +
        `${after.gramsLabel} stays in their account.`,
      payout: toSale(sale),
      holding: after,
      // What was actually paid, so the admin keeps a receipt of the payment
      // rather than of the quote that preceded it.
      report: buildReport({
        user,
        holding: beforeHolding,
        rate,
        grams,
        amountPayable,
        reference,
        billNo: billNumberFor(sale.id),
      }),
    });
  } catch (error) {
    console.error("payOut failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

module.exports = {
  listEmployees,
  listEmployeeUsers,
  getUserPayoutView,
  generateReport,
  payOut,
};
