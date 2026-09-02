// The "Controller" in MVC.
// Handles the HTTP request/response for everything auth-related:
// login, forgot password (send OTP) and reset password (verify OTP).
//
// Each kind of account has its own table and its own login page, so every
// route here accepts an optional `role` telling it which page called:
//   role = "admin" -> /admin, the admin panel door. Both the main admin
//                     (table `admins`) and sub-admins (table `sub_admins`)
//                     sign in here; the response says which one, and the
//                     frontend sends them to their own dashboard.
//   role = "user"  -> /user,  the `users` table, lands on the user portal
//
// The email is looked up across all the account tables and only then checked
// against the door - see belongsToDoor() below for why.

const bcrypt = require("bcryptjs");
const { findByEmailAnywhere, modelForRole } = require("../models/accounts");
const generateToken = require("../utils/generateToken");
const { generateOtp, hashOtp, otpMatches } = require("../utils/generateOtp");
const { sendOtpEmail } = require("../utils/sendEmail");

const OTP_VALID_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;
const MIN_PASSWORD_LENGTH = 6;

// bcrypt.compare throws "Illegal arguments" on anything that isn't a string,
// and a truthy non-string (a number, an object, an array) gets past a plain
// `!password` check - which turned a malformed login into an unauthenticated
// 500 on every door in the app. Every credential read from a request body goes
// through this first.
function asCredential(value) {
  return typeof value === "string" ? value : "";
}

// Which account tables each login page is allowed to sign in.
const LOGIN_DOORS = {
  admin: ["admin", "subadmin"],
  user: ["user"],
};

// The door the caller says it is, or null if it didn't say.
function requestedRole(body) {
  const role = String(body.role || "").trim().toLowerCase();
  return LOGIN_DOORS[role] ? role : null;
}

function belongsToDoor(account, door) {
  return !door || LOGIN_DOORS[door].includes(account.role);
}

function wrongPageMessage(expected) {
  return expected === "admin"
    ? "This is the admin login. Please sign in at the user login page instead."
    : "This is the user login. Please sign in at the admin login page instead.";
}

// @route  POST /api/auth/login
async function login(req, res) {
  try {
    const email = asCredential(req.body.email);
    const password = asCredential(req.body.password);
    const expectedRole = requestedRole(req.body);

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const account = await findByEmailAnywhere(email);
    if (!account) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isPasswordCorrect = await bcrypt.compare(password, account.password);
    if (!isPasswordCorrect) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Checked after the password so a wrong guess can't reveal which accounts
    // exist - which is also why the lookup above searches every table rather
    // than only this door's.
    if (!belongsToDoor(account, expectedRole)) {
      return res.status(403).json({ message: wrongPageMessage(expectedRole) });
    }

    // A deactivated sub-admin can no longer get in at all.
    if (!account.is_active) {
      return res.status(403).json({
        message: "Your account has been deactivated. Please contact the main admin.",
      });
    }

    const token = generateToken(account);

    res.json({
      message: "Login successful",
      token,
      user: { id: account.id, name: account.name, email: account.email, role: account.role },
    });
  } catch (error) {
    console.error("login failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route  POST /api/auth/forgot-password
// Generates a 6-digit OTP, stores it (with a 10 minute expiry) and emails it.
async function forgotPassword(req, res) {
  try {
    const email = asCredential(req.body.email);
    const expectedRole = requestedRole(req.body);

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const account = await findByEmailAnywhere(email);

    // Don't reveal whether the email exists (or which role it belongs to).
    // Deactivated accounts are treated the same way - no OTP goes out.
    if (!account || !belongsToDoor(account, expectedRole) || !account.is_active) {
      return res.json({ message: "If that email exists, an OTP has been sent to it" });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_VALID_MINUTES * 60 * 1000);

    // Hashed on the way in; the plain code only ever exists in the email.
    await modelForRole(account.role).setResetOtp(account.id, hashOtp(otp), expiresAt);
    await sendOtpEmail(email, otp);

    res.json({ message: "If that email exists, an OTP has been sent to it" });
  } catch (error) {
    console.error("forgotPassword failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route  POST /api/auth/reset-password
// Verifies the OTP and, if valid, saves the new password.
async function resetPassword(req, res) {
  try {
    const email = asCredential(req.body.email);
    const otp = asCredential(req.body.otp).trim();
    const newPassword = asCredential(req.body.newPassword);
    const expectedRole = requestedRole(req.body);

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "Email, OTP and new password are required" });
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res
        .status(400)
        .json({ message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const account = await findByEmailAnywhere(email);
    if (
      !account ||
      !account.reset_otp ||
      !belongsToDoor(account, expectedRole) ||
      !account.is_active
    ) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    const model = modelForRole(account.role);
    const isOtpExpired = new Date() > new Date(account.reset_otp_expires);

    // Compared against the stored hash, in constant time.
    if (!otpMatches(otp, account.reset_otp) || isOtpExpired) {
      // A wrong code costs an attempt. Without this the six-digit space could
      // simply be walked through, since the code otherwise survives every
      // failure until it expires.
      const attempts = await model.recordOtpFailure(account.id);

      if (attempts >= MAX_OTP_ATTEMPTS || isOtpExpired) {
        await model.clearResetOtp(account.id);
      }

      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await model.updatePassword(account.id, hashedPassword);
    await model.clearResetOtp(account.id);

    res.json({ message: "Password reset successful. You can now log in." });
  } catch (error) {
    console.error("resetPassword failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

module.exports = { login, forgotPassword, resetPassword };
