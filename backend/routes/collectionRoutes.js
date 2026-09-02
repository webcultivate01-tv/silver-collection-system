// Collections: /api/collections
//
// Two audiences, so the guard is per group rather than one router-wide
// `router.use`:
//
//   /me...       -> the employee reading their own Monthly Collection screen
//   /employees.. -> the panel: the main admin from the sidebar, and sub-admins,
//                   who get the same reporting view they get on the purchase
//                   ledger
//
// Everything here is read-only, and an employee can only ever ask about their
// own counter - the /me routes take the employee off the token, never off the
// URL. The customer portal has its own, narrower route
// (/api/purchases/my-holding) and nothing here is reachable from it.

const express = require("express");
const {
  listCollectionEmployees,
  getEmployeeCollections,
  getMyCollectionTotals,
  getMyMonthlyCollections,
  getMyMonthCollections,
} = require("../controllers/collectionController");
const { protect, employeeOnly, panelReadAccess } = require("../middleware/authMiddleware");

const router = express.Router();

const atCounter = [protect, employeeOnly];
const onPanel = [protect, panelReadAccess];

// The employee's own collections.
router.get("/me", ...atCounter, getMyCollectionTotals);
router.get("/me/monthly", ...atCounter, getMyMonthlyCollections);
router.get("/me/months/:month", ...atCounter, getMyMonthCollections);

// The admin panel.
router.get("/employees", ...onPanel, listCollectionEmployees);
router.get("/employees/:id", ...onPanel, getEmployeeCollections);

module.exports = router;
