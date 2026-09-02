// User Management inside the employee portal: /api/employee/users
//
// Every route is employee-only, and each one that names a user checks in the
// controller that the user belongs to the signed-in employee.

const express = require("express");
const {
  listMyUsers,
  getMyUser,
  createUser,
  updateUser,
  resetUserPassword,
  setUserStatus,
} = require("../controllers/employeeUserController");
const { protect, employeeOnly } = require("../middleware/authMiddleware");
const { uploadUserDocuments } = require("../middleware/employeeUploadMiddleware");

const router = express.Router();

router.use(protect, employeeOnly);

router.get("/", listMyUsers);
router.post("/", uploadUserDocuments, createUser);
router.get("/:id", getMyUser);
router.put("/:id", uploadUserDocuments, updateUser);
router.put("/:id/reset-password", resetUserPassword);
router.put("/:id/status", setUserStatus);

module.exports = router;
