// Handles the signed-in account's own profile: view, edit details, change password.
// req.user is set by the "protect" middleware after verifying the JWT.
//
// Every kind of account has its own table now, so which table this is about
// comes from the token's role - see models/accounts.js. That means the main
// admin, a sub-admin and a plain user all use these same routes and each one
// only ever touches its own row.
//
// Sub-admins can read their profile but not change it: server.js blocks every
// non-GET request they make before it reaches this file.

const bcrypt = require("bcryptjs");
const { modelForRole, emailTakenAnywhere } = require("../models/accounts");
const ManagedUserModel = require("../models/managedUserModel");
const { ROLES } = require("../middleware/authMiddleware");
const { removeFile } = require("../utils/employeeFiles");
const { saveUserDocuments } = require("../utils/userFiles");
const { saveLooseProfilePhoto } = require("../utils/profilePhoto");

// Kept in step with adminController.js, which applies the same rules to the
// same two fields on the Admin Management screen.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

// The model for whoever is signed in, or null for a role with no account table
// (an employee token, or one that has been tampered with).
function modelForRequest(req) {
  return modelForRole(req.user?.role);
}

function noAccountResponse(res) {
  return res.status(404).json({ message: "Account not found" });
}

// Even to its owner, only the last 4 digits are shown - the same rule the
// employee's own profile and every report follow.
function maskAadhaar(aadhaar) {
  if (!aadhaar) return null;
  return `XXXX XXXX ${String(aadhaar).slice(-4)}`;
}

// A user's row carries the fuller record their employee filled in at
// registration - mobile, address, ID numbers, uploaded documents. The shared
// account model knows nothing about those columns, so they are added on here
// for the user's own profile screen. Every key the account model already
// returned stays exactly as it was.
async function userOwnDetails(id) {
  const row = await ManagedUserModel.findById(id);
  if (!row) return {};

  return {
    first_name: row.first_name,
    last_name: row.last_name,
    mobile: row.mobile,
    age: row.age,
    address: row.address,
    date_of_birth: row.date_of_birth,
    aadhaar_number: maskAadhaar(row.aadhaar_number),
    pan_number: row.pan_number,
    registered_by: row.employee_name,
    // View only - replacing one of these is the employee's job.
    documents: {
      aadhaarFront: row.aadhaar_front,
      aadhaarBack: row.aadhaar_back,
      panFront: row.pan_front,
    },
  };
}

// @route  GET /api/profile
async function getProfile(req, res) {
  try {
    const model = modelForRequest(req);
    if (!model) return noAccountResponse(res);

    const user = await model.findById(req.user.id);
    if (!user) {
      return noAccountResponse(res);
    }

    if (req.user.role === ROLES.USER) {
      return res.json({ user: { ...user, ...(await userOwnDetails(req.user.id)) } });
    }

    res.json({ user });
  } catch (error) {
    console.error("getProfile failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route  PUT /api/profile
async function updateProfile(req, res) {
  try {
    const model = modelForRequest(req);
    if (!model) return noAccountResponse(res);

    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();

    if (!name || !email) {
      return res.status(400).json({ message: "Name and email are required" });
    }

    // The same rules Admin Management applies. This route used to apply none:
    // it wrote whatever it was given, so "not-an-email" became a login address,
    // and a duplicate either crashed with a raw driver error (same table) or
    // succeeded and left two accounts answering to one address (different
    // tables), which makes login ambiguous.
    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({
        message: "Please correct the highlighted fields",
        errors: { name: "Name must be between 2 and 100 characters" },
      });
    }

    if (!EMAIL_PATTERN.test(email) || email.length > 150) {
      return res.status(400).json({
        message: "Please correct the highlighted fields",
        errors: { email: "Enter a valid email address" },
      });
    }

    // Checked across every account table, because MySQL can only enforce
    // uniqueness within one and a login searches all of them.
    const taken = await emailTakenAnywhere(email, {
      excludeRole: req.user.role,
      excludeId: req.user.id,
    });

    if (taken) {
      return res.status(409).json({
        message: "An account with this email already exists",
        errors: { email: "An account with this email already exists" },
      });
    }

    await model.updateProfile(req.user.id, { name, email });
    const updatedUser = await model.findById(req.user.id);

    res.json({ message: "Profile updated successfully", user: updatedUser });
  } catch (error) {
    console.error("updateProfile failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route  PUT /api/profile/change-password
async function changePassword(req, res) {
  try {
    const model = modelForRequest(req);
    if (!model) return noAccountResponse(res);

    // Strings only: bcrypt.compare throws on anything else, which turned a
    // malformed request into a 500.
    const currentPassword = typeof req.body.currentPassword === "string" ? req.body.currentPassword : "";
    const newPassword = typeof req.body.newPassword === "string" ? req.body.newPassword : "";

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password are required" });
    }

    // The same minimum every other password path in the app enforces. This one
    // enforced nothing, so a single character was accepted - for the main admin
    // included.
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res
        .status(400)
        .json({ message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    // req.user (from the JWT) only has id/role, so load the full row - including
    // the hashed password - to check the current one against.
    const account = await model.findByIdWithPassword(req.user.id);
    if (!account) {
      return noAccountResponse(res);
    }

    const isPasswordCorrect = await bcrypt.compare(currentPassword, account.password);
    if (!isPasswordCorrect) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await model.updatePassword(req.user.id, hashedPassword);

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("changePassword failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// A user registered from the employee panel already has a folder of their own -
// uploads/user/<employee-folder>/<user-folder>/ - holding the photo and the ID
// scans that employee uploaded. A photo the user picks themselves belongs in
// that same folder, written under the same profile-photo-<stamp> name and into
// the same `profile_image` column, so the employee's copy of the record and the
// user's own screen never drift apart and nothing is left loose in uploads/.
//
// Returns null when there is no folder to write into - a user nobody registered
// through the employee panel - and the caller falls back to a loose file.
async function saveUserPhotoInOwnFolder(id, file) {
  const row = await ManagedUserModel.findById(id);
  if (!row?.folder_name) return null;

  const saved = await saveUserDocuments(row.folder_name, { profilePhoto: [file] });
  return saved.profile_image || null;
}

// @route  PUT /api/profile/image
async function uploadProfileImage(req, res) {
  try {
    const model = modelForRequest(req);
    if (!model) return noAccountResponse(res);

    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    const account = await model.findById(req.user.id);
    if (!account) {
      return noAccountResponse(res);
    }

    let imagePath = null;

    if (req.user.role === ROLES.USER) {
      imagePath = await saveUserPhotoInOwnFolder(req.user.id, req.file);
    }

    // The admin and sub-admins have no document folder, and neither does a user
    // who was never registered by an employee: their photo stays in uploads/.
    if (!imagePath) {
      imagePath = await saveLooseProfilePhoto(req.user.id, req.file);
    }

    await model.updateProfileImage(req.user.id, imagePath);

    // Drop the photo that was just replaced, the way the employee panel does -
    // the folder keeps one profile photo, not a pile of them.
    if (account.profile_image && account.profile_image !== imagePath) {
      await removeFile(account.profile_image);
    }

    const updatedUser = await model.findById(req.user.id);

    res.json({ message: "Profile image updated successfully", user: updatedUser });
  } catch (error) {
    console.error("uploadProfileImage failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

module.exports = { getProfile, updateProfile, changePassword, uploadProfileImage };
