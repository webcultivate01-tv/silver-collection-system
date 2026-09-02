// Selling silver back, guarded per route the same way purchaseRoutes.js is:
//
//   employee -> the counter: pick a customer, record what they sold
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
router.post("/:id/approve", protect, adminOnly, approveSale);

module.exports = router;
