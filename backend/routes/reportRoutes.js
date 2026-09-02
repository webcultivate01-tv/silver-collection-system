const express = require("express");
const {
  getSummary,
  getEmployeeReport,
  getSilverRateReport,
} = require("../controllers/reportController");
const { protect, panelReadAccess } = require("../middleware/authMiddleware");

const router = express.Router();

// Open to the main admin and to sub-admins. GET only - there is deliberately
// no POST/PUT/DELETE on this router at all.
router.use(protect, panelReadAccess);

router.get("/summary", getSummary);
router.get("/employees", getEmployeeReport);
router.get("/silver-rates", getSilverRateReport);

module.exports = router;
