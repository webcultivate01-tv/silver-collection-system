// Selling silver back, guarded per route the same way purchaseRoutes.js is:
//
//   employee -> the counter: pick one of their own users, record what they
//               sold (same ownership rule as the buy side)
//   user     -> their own sell-back history, and nothing else
//   panel    -> admin and sub-admin read every sale (GET only); only the main
//               admin can approve a payout

const express = require("express");
const {
  getSaleRate,
  recordSale,
  listMyRecordedSales,
  getMySales,
  listAllSales,
  getSaleBill,
  approveSale,
} = require("../controllers/saleController");
const {
  protect,
  employeeOnly,
  userOnly,
  adminOnly,
  panelReadAccess,
} = require("../middleware/authMiddleware");

const router = express.Router();

const atCounter = [protect, employeeOnly];
const asCustomer = [protect, userOnly];
const onPanel = [protect, panelReadAccess];

// The customer's own view.
router.get("/my-sales", ...asCustomer, getMySales);

// The counter.
router.get("/rate", ...atCounter, getSaleRate);
router.get("/recorded-by-me", ...atCounter, listMyRecordedSales);
router.post("/", ...atCounter, recordSale);

// The admin panel.
router.get("/", ...onPanel, listAllSales);
// Reprinting a customer's bill is a read of a payout already made, so it sits
// with the rest of the panel's reporting rather than in the payout flow at
// /api/payouts, which exists to SET a handover up and is main-admin only.
router.get("/:id/bill", ...onPanel, getSaleBill);
router.post("/:id/approve", protect, adminOnly, approveSale);

module.exports = router;
