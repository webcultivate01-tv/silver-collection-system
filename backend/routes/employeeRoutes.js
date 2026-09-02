const express = require("express");
const {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  resetEmployeePassword,
  setEmployeeBlocked,
  deleteEmployee,
} = require("../controllers/employeeController");
const { protect, adminOnly } = require("../middleware/authMiddleware");
const { uploadEmployeeDocuments } = require("../middleware/employeeUploadMiddleware");

const router = express.Router();

// Employee management is admin-only.
router.use(protect, adminOnly);

router.get("/", listEmployees);
router.post("/", uploadEmployeeDocuments, createEmployee);
router.get("/:id", getEmployee);
router.put("/:id", uploadEmployeeDocuments, updateEmployee);
router.put("/:id/reset-password", resetEmployeePassword);
router.put("/:id/block", setEmployeeBlocked);
router.delete("/:id", deleteEmployee);

module.exports = router;
