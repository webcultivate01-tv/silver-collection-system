const express = require("express");
const { submitEnquiry } = require("../controllers/enquiryController");

const router = express.Router();

// Public: no token, no session. Mounted behind the strict limiter in app.js -
// this route sends an email on demand, so it belongs in the same bucket as the
// authentication routes rather than under the loose API-wide backstop.
router.post("/", submitEnquiry);

module.exports = router;
