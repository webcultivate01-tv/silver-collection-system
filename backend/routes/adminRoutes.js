const express = require("express");
const {
  listAdmins,
  getAdmin,
  createSubAdmin,
  updateSubAdmin,
  setSubAdminStatus,
  deleteSubAdmin,
} = require("../controllers/adminController");
const { protect, mainAdminOnly } = require("../middleware/authMiddleware");

const router = express.Router();

// Admin Management is main-admin-only, including the read routes.
// A sub-admin gets 403 here even on a plain GET.
router.use(protect, mainAdminOnly);

router.get("/", listAdmins);
router.post("/", createSubAdmin);
router.get("/:id", getAdmin);
router.put("/:id", updateSubAdmin);
router.put("/:id/status", setSubAdminStatus);
router.delete("/:id", deleteSubAdmin);

module.exports = router;
