// The contact form, and the panel screen that works through what it collects.
//
// One router for two very different audiences, which is why the guards are
// spelled out per route rather than applied to the whole file:
//
//   POST /            public. No token, no session - a visitor on the landing
//                     page. The strict limiter is applied HERE rather than at
//                     the mount point in app.js, so that it throttles the one
//                     unauthenticated route and not an admin reading the list.
//   GET  /, GET /:id  admin and sub-admin, read-only.
//   PATCH /:id        admin and sub-admin. Working an enquiry - moving it to
//                     'in progress', closing it, noting what was done - is the
//                     second write a sub-admin is allowed anywhere in the app,
//                     so like the first it is named exactly in SUB_ADMIN_WRITES
//                     (authMiddleware.js), which is what gets the request past
//                     the blanket block in app.js, and guarded again here by
//                     panelEnquiryAccess, which re-reads the account.
//   DELETE /:id       main admin only. Closing an enquiry is working it;
//                     deleting one destroys the record that it ever arrived,
//                     and that stays with the account that owns the shop.

const express = require("express");
const {
  submitEnquiry,
  listEnquiries,
  getEnquiry,
  updateEnquiry,
  deleteEnquiry,
} = require("../controllers/enquiryController");
const {
  protect,
  adminOnly,
  panelReadAccess,
  panelEnquiryAccess,
} = require("../middleware/authMiddleware");
const { enquiryLimiter } = require("../middleware/rateLimitMiddleware");

const router = express.Router();

const onPanel = [protect, panelReadAccess];

// The landing page.
router.post("/", enquiryLimiter, submitEnquiry);

// The admin and sub-admin panels.
router.get("/", ...onPanel, listEnquiries);
router.get("/:id", ...onPanel, getEnquiry);
router.patch("/:id", protect, panelEnquiryAccess, updateEnquiry);
router.delete("/:id", protect, adminOnly, deleteEnquiry);

module.exports = router;
