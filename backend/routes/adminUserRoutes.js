// The admin panel's Users screen: /api/users
//
// Users are registered and edited by the employee who owns them, in the
// employee portal - nothing here writes.
//
// The list (Aadhaar masked, same as every other report) is open to the main
// admin and to sub-admins, so it can appear on the sub-admin's Reports
// download centre. The single-user detail view returns the unmasked record
// and documents, so that stays admin-only.

const express = require("express");
const { listUsers, getUser } = require("../controllers/adminUserController");
const { protect, adminOnly, panelReadAccess } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/", panelReadAccess, listUsers);
router.get("/:id", adminOnly, getUser);

module.exports = router;
