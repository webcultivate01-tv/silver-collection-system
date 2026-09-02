// Builds the Express app and wires every router onto it.
//
// This file deliberately does nothing on import beyond constructing the app:
// no database connection, no migration, no listening on a port. That is what
// server.js does. Keeping the two apart is what lets the test suite import the
// app and drive it with supertest, without a port ever being bound.
//
// The order things are mounted in matters and is unchanged from when this
// lived in server.js - see the comments on each block.

const path = require("path");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/profileRoutes");
const employeeRoutes = require("./routes/employeeRoutes");
const employeeAuthRoutes = require("./routes/employeeAuthRoutes");
const employeeUserRoutes = require("./routes/employeeUserRoutes");
const silverRateRoutes = require("./routes/silverRateRoutes");
const adminRoutes = require("./routes/adminRoutes");
const adminUserRoutes = require("./routes/adminUserRoutes");
const reportRoutes = require("./routes/reportRoutes");
const purchaseRoutes = require("./routes/purchaseRoutes");
const saleRoutes = require("./routes/saleRoutes");
const payoutRoutes = require("./routes/payoutRoutes");
const settlementRoutes = require("./routes/settlementRoutes");
const collectionRoutes = require("./routes/collectionRoutes");
const enquiryRoutes = require("./routes/enquiryRoutes");
const { blockSubAdminWrites } = require("./middleware/authMiddleware");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const { authLimiter, enquiryLimiter, apiLimiter } = require("./middleware/rateLimitMiddleware");
const { serveDocument } = require("./controllers/documentController");

function createApp() {
  const app = express();

  // Wide open (reflects any origin) unless CORS_ORIGIN is set, which is fine
  // while the frontend sends a Bearer token rather than a cookie - there's
  // nothing an allowed origin gets that a disallowed one couldn't also get by
  // calling the API directly. Still, an admin/sub-admin panel is worth locking
  // down once it has a real domain: set CORS_ORIGIN in .env (comma-separated
  // for more than one) to restrict it.
  const allowedOrigins = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Sets nosniff, frameguard, referrer-policy and the rest. crossOriginResourcePolicy
  // is relaxed because the frontend is served from a different origin in
  // development and loads document images from here.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.disable("x-powered-by");

  app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : undefined));
  app.use(express.json({ limit: "1mb" }));

  // Brand artwork: the wordmark and hero backdrop the public landing page
  // shows, and the authorised signatory's signature printed on every tax
  // invoice. These are the only files under uploads/ that are deliberately
  // public, so they are answered here - above the guard below, which would
  // otherwise turn them away: the landing page has no session to authenticate
  // with, and no row in any table owns any of them.
  //
  // The signature is shop stationery, not personal data: it is printed on the
  // bill handed to every customer, so it is no more private than the bill.
  //
  // The list is spelled out rather than taken from the URL on purpose. Anything
  // that reads a filename off the request and joins it onto uploads/ is one
  // "../" away from serving the Aadhaar scans sitting in the same tree.
  const PUBLIC_BRAND_FILES = ["logo.png", "Hero-Bg.png", "signiture.png"];

  for (const filename of PUBLIC_BRAND_FILES) {
    app.get(`/uploads/${filename}`, (req, res) => {
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.sendFile(path.join(__dirname, "uploads", filename));
    });
  }

  // Uploaded documents. NOT express.static: these are Aadhaar and PAN scans,
  // and serving them statically made the whole tree public to anyone who
  // guessed a path. Every request is authenticated and ownership-checked -
  // see controllers/documentController.js.
  app.use("/uploads", serveDocument);

  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  // A backstop over everything below. The authentication routes get their own,
  // much stricter limit on top.
  app.use("/api", apiLimiter);

  // Sign-in / forgot-password sit in front of the read-only guard: they are how
  // an account gets a session in the first place, and resetting your own
  // password (with an OTP emailed to you) isn't system data.
  app.use("/api/auth", authLimiter, authRoutes);

  // The landing page's enquiry form. Public in the same way the login page
  // is, and mounted next to it for the same reason: it is reached with no
  // session at all, so it has to sit above the read-only guard below. The
  // strict limiter applies because every request here sends an email.
  app.use("/api/enquiries", enquiryLimiter, enquiryRoutes);

  // "Sub-Admin = read + download only", enforced in one place for everything
  // below rather than route by route. Any non-GET request carrying a sub-admin
  // token is refused here, before it can reach a controller.
  app.use(blockSubAdminWrites);

  app.use("/api/profile", profileRoutes);
  app.use("/api/employees", employeeRoutes);
  // The more specific path first, so it is obvious which router serves it.
  app.use("/api/employee/users", employeeUserRoutes);
  // The strict limiter is applied inside this router, to the three
  // unauthenticated routes only - putting it here would also throttle an
  // employee simply loading their own profile.
  app.use("/api/employee", employeeAuthRoutes);
  app.use("/api/silver-rate", silverRateRoutes);
  app.use("/api/admins", adminRoutes);
  app.use("/api/users", adminUserRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/purchases", purchaseRoutes);
  app.use("/api/sales", saleRoutes);
  // The admin panel's payout flow. The history it writes into is read back
  // through /api/sales, which is the one sell-back ledger.
  app.use("/api/payouts", payoutRoutes);
  app.use("/api/settlements", settlementRoutes);
  app.use("/api/collections", collectionRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
