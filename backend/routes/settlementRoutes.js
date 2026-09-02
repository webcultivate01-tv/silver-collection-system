// The daily cash handover, read and written by two different kinds of
// account, same shape as purchaseRoutes.js:
//
//   employee -> bundle their unsettled takings into a handover, see their own
//               handover history
//   panel    -> admin and sub-admin read every handover, and either of them
//               can accept one
//
// Accepting is the one write a sub-admin is allowed anywhere in the app, so it
// is guarded twice: by SUB_ADMIN_WRITES in authMiddleware.js, which names this
// exact path and lets the request past the blanket block in server.js, and by
// panelCashAccess here, which re-reads the account so a sub-admin deactivated
// this morning can't accept cash this afternoon.

const express = require("express");
const {
  getPendingSummary,
  createSettlement,
  listMySettlements,
  listSettlements,
  getSettlementDetail,
  acceptSettlement,
} = require("../controllers/settlementController");
const {
  protect,
  employeeOnly,
  panelReadAccess,
  panelCashAccess,
} = require("../middleware/authMiddleware");

const router = express.Router();

const atCounter = [protect, employeeOnly];
const onPanel = [protect, panelReadAccess];

// The counter.
router.get("/pending-summary", ...atCounter, getPendingSummary);
router.get("/mine", ...atCounter, listMySettlements);
router.post("/", ...atCounter, createSettlement);

// The admin panel.
router.get("/", ...onPanel, listSettlements);
router.get("/:id", ...onPanel, getSettlementDetail);
router.post("/:id/accept", protect, panelCashAccess, acceptSettlement);

module.exports = router;
