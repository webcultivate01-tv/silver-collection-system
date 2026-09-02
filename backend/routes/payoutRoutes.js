// The admin panel's Silver Payouts flow: /api/payouts
//
// Everything here is main-admin only, reads included.
//
// A sub-admin is read-and-download, so it would be tempting to open the four
// GETs to them the way the sell-back ledger at /api/sales is open. They stay
// closed on purpose: these routes exist to set a handover up. The employee
// list, the client book and the report are the steps of giving a customer a
// silver coin, and a report carries a live `reference` that POST /api/payouts
// will spend. A sub-admin who wants to READ what has been given out has the
// whole payout history at GET /api/sales, which is where reporting belongs.
//
// blockSubAdminWrites in server.js already stops them writing; this is the
// narrower rule on top of it, so nothing here depends on that one blanket
// guard being the only thing in the way.

const express = require("express");
const {
  listEmployees,
  listEmployeeUsers,
  getUserPayoutView,
  generateReport,
  payOut,
} = require("../controllers/payoutController");
const { protect, adminOnly } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect, adminOnly);

// 1. Pick an employee.
router.get("/employees", listEmployees);

// 2. Pick one of their users.
router.get("/employees/:employeeId/users", listEmployeeUsers);

// 3. See what that user holds.
router.get("/users/:userId", getUserPayoutView);

// 4. Generate the report. A POST because it takes an amount in the body, but
//    it writes nothing - see payoutController.
router.post("/report", generateReport);

// 5. Pay. The only write in the flow.
router.post("/", payOut);

module.exports = router;
