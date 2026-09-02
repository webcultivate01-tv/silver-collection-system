// The employee panel's User Management: an employee registers their own users
// and can then list, view, edit and manage those - and only those.
//
// Ownership is the whole point of this file. Every route that names a user goes
// through loadMyUser(), which answers 404 for anything that isn't the
// signed-in employee's own row. So one employee never sees, edits or resets
// another employee's user, whether the request comes from the UI or from a
// hand-made API call with a guessed id.
//
// A user registered here is an ordinary portal user: they sign in at /user with
// the email and password the employee gives them, and purchases are recorded
// against them at the counter as usual.

const bcrypt = require("bcryptjs");
const ManagedUserModel = require("../models/managedUserModel");
const SilverPurchaseModel = require("../models/silverPurchaseModel");
const SilverSaleModel = require("../models/silverSaleModel");
const { loadHolding } = require("../utils/holding");
const { toPurchase } = require("./purchaseController");
const { toSale } = require("./saleController");
const { emailTakenAnywhere } = require("../models/accounts");
const { ROLES } = require("../middleware/authMiddleware");
const generateTempPassword = require("../utils/generateTempPassword");
const { removeFile, slugify } = require("../utils/employeeFiles");
const {
  USER_DOCUMENTS,
  buildUserFolder,
  deleteUserFolder,
  missingUserDocuments,
  saveUserDocuments,
  userFolderExistsOnDisk,
} = require("../utils/userFiles");

// A user is asked for almost exactly the same details as an employee (all but
// the alternate mobile, which is why `staffFields` stays off), so the same
// validator covers both forms.
const validatePersonDetails = require("../utils/validateEmployee");

const MIN_PASSWORD_LENGTH = 6;

// Aadhaar is sensitive, so a list row only ever shows the last 4 digits.
function maskAadhaar(aadhaar) {
  if (!aadhaar) return null;
  return `XXXX XXXX ${String(aadhaar).slice(-4)}`;
}

function toListItem(user) {
  return { ...user, aadhaar_number: maskAadhaar(user.aadhaar_number) };
}

// The folder on disk that holds this employee's users. Employees registered
// before documents existed have no folder_name, so fall back to something
// stable and readable.
function employeeFolderFor(employee) {
  return slugify(employee.folder_name || employee.employee_code || `employee-${employee.id}`);
}

// "<employee-folder>/<firstname>-<lastname>", with a numeric suffix if that
// folder is already somebody else's.
async function reserveUserFolder(employee, values, excludeId = null) {
  const base = buildUserFolder(employeeFolderFor(employee), values.firstName, values.lastName);

  let candidate = base;
  let suffix = 2;

  while (
    (await ManagedUserModel.folderNameTaken(candidate, excludeId)) ||
    userFolderExistsOnDisk(candidate)
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

// Email has to stay unique across every account table (a login searches all of
// them), Aadhaar and PAN only across users. Returns { field: message } or null.
async function findConflict(values, excludeId = null) {
  const emailTaken = await emailTakenAnywhere(values.email, {
    excludeRole: ROLES.USER,
    excludeId,
  });

  if (emailTaken) {
    return { email: "An account with this email already exists" };
  }

  if (await ManagedUserModel.aadhaarTaken(values.aadhaarNumber, excludeId)) {
    return { aadhaarNumber: "A user with this Aadhaar number already exists" };
  }

  if (await ManagedUserModel.panTaken(values.panNumber, excludeId)) {
    return { panNumber: "A user with this PAN number already exists" };
  }

  return null;
}

// Loads the user this request names, but only if the signed-in employee added
// them. Returns null once it has already answered the request.
async function loadMyUser(req, res) {
  const user = await ManagedUserModel.findById(req.params.id);

  if (!user || user.created_by_employee_id !== req.employee.id) {
    res.status(404).json({ message: "User not found" });
    return null;
  }

  return user;
}

// @route GET /api/employee/users
async function listMyUsers(req, res) {
  try {
    const { search = "", status = "all" } = req.query;

    const users = await ManagedUserModel.findAll({
      employeeId: req.employee.id,
      search: String(search).trim().slice(0, 80),
      status,
    });
    const counts = await ManagedUserModel.countByStatus(req.employee.id);

    res.json({ users: users.map(toListItem), counts });
  } catch (error) {
    console.error("listMyUsers failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route GET /api/employee/users/:id
// Alongside the record: what this user holds now, and the purchases and
// sell-backs behind that figure - the same computation the customer's own
// portal and the counter use (see utils/holding.js), so this employee sees
// exactly what their user sees.
async function getMyUser(req, res) {
  try {
    const user = await loadMyUser(req, res);
    if (!user) return;

    const [holding, purchases, sales] = await Promise.all([
      loadHolding(user.id),
      SilverPurchaseModel.listForUser(user.id, { limit: 50 }),
      SilverSaleModel.listForUser(user.id, { limit: 50 }),
    ]);

    res.json({
      user,
      holding,
      purchases: purchases.map(toPurchase),
      sales: sales.map(toSale),
    });
  } catch (error) {
    console.error("getMyUser failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route POST /api/employee/users  (multipart/form-data)
// The employee fills in the same form the admin uses for an employee, chooses a
// password for the user's portal login, and uploads the four documents.
async function createUser(req, res) {
  try {
    const { errors, values } = validatePersonDetails(req.body);
    const files = req.files || {};

    const password = String(req.body.password || "");
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }

    Object.assign(errors, missingUserDocuments(files));

    if (Object.keys(errors).length) {
      return res.status(400).json({ message: "Please correct the highlighted fields", errors });
    }

    const conflict = await findConflict(values);
    if (conflict) {
      return res.status(409).json({ message: Object.values(conflict)[0], errors: conflict });
    }

    const folderName = await reserveUserFolder(req.employee, values);
    const hashedPassword = await bcrypt.hash(password, 10);

    const id = await ManagedUserModel.create({
      ...values,
      folderName,
      password: hashedPassword,
      employeeId: req.employee.id,
    });

    // The row exists now, so any failure while writing the documents has to roll
    // it back - a half-registered user would be worse than none.
    try {
      const savedPaths = await saveUserDocuments(folderName, files);
      await ManagedUserModel.updateDocuments(id, savedPaths);
    } catch (error) {
      await ManagedUserModel.remove(id);
      await deleteUserFolder(folderName);
      throw error;
    }

    const user = await ManagedUserModel.findById(id);

    res.status(201).json({ message: "User registered successfully", user });
  } catch (error) {
    console.error("createUser failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route PUT /api/employee/users/:id  (multipart/form-data)
// Documents are optional here - only the ones picked again get replaced. The
// user's folder keeps the name it was created with, so their stored paths stay
// valid even if their name changes.
async function updateUser(req, res) {
  try {
    const existing = await loadMyUser(req, res);
    if (!existing) return;

    const { errors, values } = validatePersonDetails(req.body);

    if (Object.keys(errors).length) {
      return res.status(400).json({ message: "Please correct the highlighted fields", errors });
    }

    const conflict = await findConflict(values, existing.id);
    if (conflict) {
      return res.status(409).json({ message: Object.values(conflict)[0], errors: conflict });
    }

    // Registered before documents existed (or by the seeder) - this is where
    // their files go from now on.
    const folderName =
      existing.folder_name || (await reserveUserFolder(req.employee, values, existing.id));

    await ManagedUserModel.update(existing.id, { ...values, folderName });

    const savedPaths = await saveUserDocuments(folderName, req.files || {});
    await ManagedUserModel.updateDocuments(existing.id, savedPaths);

    // Drop whichever old files were just replaced.
    for (const doc of USER_DOCUMENTS) {
      if (savedPaths[doc.column] && existing[doc.column]) {
        await removeFile(existing[doc.column]);
      }
    }

    const user = await ManagedUserModel.findById(existing.id);

    res.json({ message: "User details updated", user });
  } catch (error) {
    console.error("updateUser failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route PUT /api/employee/users/:id/reset-password
// For when a user forgets their password. The new one is shown to the employee
// once here and never stored in plain text.
async function resetUserPassword(req, res) {
  try {
    const user = await loadMyUser(req, res);
    if (!user) return;

    const password = generateTempPassword();
    await ManagedUserModel.updatePassword(user.id, await bcrypt.hash(password, 10));

    res.json({
      message: "Password reset successfully",
      password,
      user: await ManagedUserModel.findById(user.id),
    });
  } catch (error) {
    console.error("resetUserPassword failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route PUT /api/employee/users/:id/status   body: { active: true | false }
// A deactivated user can't sign in, and no purchase can be recorded for them.
// Their record and their silver are kept.
async function setUserStatus(req, res) {
  try {
    const user = await loadMyUser(req, res);
    if (!user) return;

    const active = req.body.active === true || req.body.active === "true";
    await ManagedUserModel.setActive(user.id, active);

    res.json({
      message: active ? "User activated" : "User deactivated",
      user: await ManagedUserModel.findById(user.id),
    });
  } catch (error) {
    console.error("setUserStatus failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

module.exports = {
  listMyUsers,
  getMyUser,
  createUser,
  updateUser,
  resetUserPassword,
  setUserStatus,
};
