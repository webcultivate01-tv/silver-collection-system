const express = require("express");
const {
  employeeLogin,
  getMyProfile,
  updateMyProfilePhoto,
  changeMyPassword,
  employeeForgotPassword,
  employeeResetPassword,
} = require("../controllers/employeeAuthController");
const { protect, employeeOnly } = require("../middleware/authMiddleware");
const { uploadEmployeeProfilePhoto } = require("../middleware/employeeUploadMiddleware");
const { authLimiter } = require("../middleware/rateLimitMiddleware");

const router = express.Router();

// The three unauthenticated routes carry the strict limiter: unlimited
// password attempts and unlimited guesses at a six-digit reset code were how
// this door could be walked through.
router.post("/login", authLimiter, employeeLogin);
router.post("/forgot-password", authLimiter, employeeForgotPassword);
router.post("/reset-password", authLimiter, employeeResetPassword);

router.get("/me", protect, employeeOnly, getMyProfile);
router.put(
  "/profile-photo",
  protect,
  employeeOnly,
  uploadEmployeeProfilePhoto,
  updateMyProfilePhoto
);
router.put(
  "/change-password",
  protect,
  employeeOnly,
  changeMyPassword
);

module.exports = router;
