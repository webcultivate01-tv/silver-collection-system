const express = require("express");
const {
  getProfile,
  updateProfile,
  changePassword,
  uploadProfileImage,
} = require("../controllers/profileController");
const { protect, accountIsActive } = require("../middleware/authMiddleware");
const uploadProfilePhoto = require("../middleware/uploadMiddleware");

const router = express.Router();

// A valid JWT, AND an account that is still active. `protect` only checks the
// signature - without accountIsActive, deactivating an account left it able to
// read and edit its profile and change its password until the token expired.
router.use(protect, accountIsActive);

router.get("/", getProfile);
router.put("/", updateProfile);
router.put("/change-password", changePassword);
router.put("/image", uploadProfilePhoto, uploadProfileImage);

module.exports = router;
