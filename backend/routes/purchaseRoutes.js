// The purchase ledger, read by three different kinds of account - so the guard
// is per route rather than one router-wide `router.use`:
//
//   employee -> the counter: pick one of their own users, record what they
//               paid. "Their own" is enforced in the controller, not here -
//               see utils/customerAccess.js
//   user     -> their own holding and history, and nothing else
//   panel    -> admin and sub-admin read every purchase (GET only; the
//               sub-admin write block in server.js keeps it that way)

const express = require("express");
const {
  getPurchaseRate,
  listCustomers,
  getCustomerHolding,
  recordPurchase,
  listMyRecordedPurchases,
  getMyHolding,
  listAllPurchases,
} = require("../controllers/purchaseController");
const {
  protect,
  employeeOnly,
  userOnly,
  panelReadAccess,
} = require("../middleware/authMiddleware");

const router = express.Router();

const atCounter = [protect, employeeOnly];
const asCustomer = [protect, userOnly];
const onPanel = [protect, panelReadAccess];

// The customer's own view.
router.get("/my-holding", ...asCustomer, getMyHolding);

// The counter.
router.get("/rate", ...atCounter, getPurchaseRate);
router.get("/customers", ...atCounter, listCustomers);
router.get("/customers/:userId", ...atCounter, getCustomerHolding);
router.get("/recorded-by-me", ...atCounter, listMyRecordedPurchases);
router.post("/", ...atCounter, recordPurchase);

// The admin panel.
router.get("/", ...onPanel, listAllPurchases);

module.exports = router;
