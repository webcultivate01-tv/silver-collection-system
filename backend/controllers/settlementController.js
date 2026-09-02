// The daily cash handover between an employee and the admin.
//
// Every purchase an employee records sits at payment_status = 'pending'.
// At the end of the day the employee bundles everything they've collected
// that hasn't yet been handed over into one settlement and hands the panel
// that cash in person. Only once it is accepted here does the settlement -
// and every purchase it carries - flip to 'success', so the employee, the
// admin panel and the customer's own history all agree at the same moment.
// See models/cashSettlementModel.js for the transaction that keeps the two
// tables in step.
//
// "The panel" is the main admin or a sub-admin: either can take the cash, and
// the settlement records which of them did (role and id both, since ids
// restart at 1 in each account table).

const CashSettlementModel = require("../models/cashSettlementModel");
const SilverPurchaseModel = require("../models/silverPurchaseModel");
const { toPurchase } = require("./purchaseController");
const { todayAsDate } = require("./silverRateController");
const { roundRupees } = require("../utils/silverMath");

function toSettlement(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    employeeCode: row.employee_code,
    settlementDate: row.settlement_date,
    totalAmount: roundRupees(row.total_amount),
    purchaseCount: row.purchase_count,
    status: row.status,
    acceptedBy: row.accepted_by,
    acceptedByRole: row.accepted_by ? row.accepted_by_role : null,
    acceptedByName: row.accepted_by_name || null,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
  };
}

// @route GET /api/settlements/pending-summary
// What the "Hand Over Cash" screen needs: the counter's own unsettled
// takings, before they've bundled them into a handover.
async function getPendingSummary(req, res) {
  try {
    const [totals, purchases] = await Promise.all([
      SilverPurchaseModel.unsettledTotalsForEmployee(req.employee.id),
      SilverPurchaseModel.listUnsettledForEmployee(req.employee.id),
    ]);

    res.json({
      count: totals.count,
      totalAmount: roundRupees(totals.total),
      purchases: purchases.map(toPurchase),
    });
  } catch (error) {
    console.error("getPendingSummary failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route POST /api/settlements
// Bundles every purchase this employee hasn't yet handed over into one
// settlement. The purchases stay 'pending' - this only tells the admin cash
// is coming, it doesn't record that it arrived.
async function createSettlement(req, res) {
  try {
    const settlementId = await CashSettlementModel.createFromUnsettled(
      req.employee.id,
      todayAsDate()
    );

    if (!settlementId) {
      return res.status(409).json({
        message: "There's nothing to hand over right now - every purchase you've taken is already with the admin.",
      });
    }

    const settlement = await CashSettlementModel.findById(settlementId);

    res.status(201).json({
      message: `₹${roundRupees(settlement.total_amount)} handed over — waiting for the admin to accept it.`,
      settlement: toSettlement(settlement),
    });
  } catch (error) {
    console.error("createSettlement failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route GET /api/settlements/mine
// This employee's own handover history, and whether each one has been
// accepted yet.
async function listMySettlements(req, res) {
  try {
    const settlements = await CashSettlementModel.listForEmployee(req.employee.id);
    res.json({ settlements: settlements.map(toSettlement) });
  } catch (error) {
    console.error("listMySettlements failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route GET /api/settlements?status=&date=&from=&to=&employeeId=
//        (admin + sub-admin, read-only)
async function listSettlements(req, res) {
  try {
    const asDate = (value) =>
      String(value || "").match(/^\d{4}-\d{2}-\d{2}$/) ? String(value) : "";

    const status = ["pending", "accepted"].includes(req.query.status) ? req.query.status : "all";
    const date = asDate(req.query.date);
    const from = asDate(req.query.from);
    const to = asDate(req.query.to);
    const employeeId = Number(req.query.employeeId) || null;
    const settlements = await CashSettlementModel.listAll({ status, date, from, to, employeeId });

    res.json({ settlements: settlements.map(toSettlement) });
  } catch (error) {
    console.error("listSettlements failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route GET /api/settlements/:id  (admin + sub-admin, read-only)
// The purchases one handover bundles, so the admin can see what they're
// accepting before they accept it.
async function getSettlementDetail(req, res) {
  try {
    const id = Number(req.params.id);
    const settlement = Number.isInteger(id) ? await CashSettlementModel.findById(id) : null;

    if (!settlement) {
      return res.status(404).json({ message: "Settlement not found" });
    }

    const purchases = await SilverPurchaseModel.listForSettlement(id);

    res.json({
      settlement: toSettlement(settlement),
      purchases: purchases.map(toPurchase),
    });
  } catch (error) {
    console.error("getSettlementDetail failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route POST /api/settlements/:id/accept  (admin + sub-admin)
// Whoever is on the panel has the cash in hand: mark the handover accepted -
// under their own name - and every purchase it carries 'success'.
async function acceptSettlement(req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid settlement" });
    }

    const result = await CashSettlementModel.accept(id, {
      id: req.user.id,
      role: req.user.role,
    });

    if (result === "not_found") {
      return res.status(404).json({ message: "Settlement not found" });
    }

    if (result === "already_accepted") {
      return res.status(409).json({ message: "This handover has already been accepted." });
    }

    const settlement = await CashSettlementModel.findById(id);

    res.json({
      message: `Cash accepted — ${settlement.purchase_count} purchase(s) marked as paid.`,
      settlement: toSettlement(settlement),
    });
  } catch (error) {
    console.error("acceptSettlement failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

module.exports = {
  getPendingSummary,
  createSettlement,
  listMySettlements,
  listSettlements,
  getSettlementDetail,
  acceptSettlement,
};
