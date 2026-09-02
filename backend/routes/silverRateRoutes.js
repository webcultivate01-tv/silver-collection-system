const express = require("express");
const {
  getTodayRate,
  getRateHistory,
  saveTodayRate,
} = require("../controllers/silverRateController");
const { protect, adminOnly } = require("../middleware/authMiddleware");

const router = express.Router();

// Public so the rate can also be shown on the login screens.
router.get("/today", getTodayRate);

router.get("/history", protect, adminOnly, getRateHistory);
router.post("/", protect, adminOnly, saveTodayRate);

module.exports = router;
