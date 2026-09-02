// Admin Management - main admin only.
//
// Lists the admin/sub-admin accounts and lets the main admin create, edit,
// activate/deactivate and delete SUB-ADMINS. Main admin accounts are read-only
// here: nobody can delete or deactivate the account that runs the system.
//
// Since the split into separate tables, "editable here" simply means "a row in
// `sub_admins`" - the main admin's row lives in `admins` and this file never
// writes to that table at all.
//
// Every route in this file sits behind `protect + mainAdminOnly`, so a
// sub-admin never reaches any of it.

const bcrypt = require("bcryptjs");
const {
  AdminModel,
  SubAdminModel,
  emailTakenAnywhere,
  findPanelAccounts,
  countPanelAccounts,
} = require("../models/accounts");
const { ROLES } = require("../middleware/authMiddleware");

const MIN_PASSWORD_LENGTH = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toAccount(row) {
  return {
    // Ids restart at 1 in each table, so admin #1 and sub-admin #1 both exist.
    // `key` is what the list is keyed and matched on in the UI; `id` is still
    // the plain row id every /api/admins/:id route takes.
    key: `${row.role}-${row.id}`,
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isMainAdmin: row.role === ROLES.ADMIN,
    isActive: !!row.is_active,
    profileImage: row.profile_image,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Shared by create and update. Returns { errors, values }.
function validateAccount(body) {
  const errors = {};

  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();

  if (name.length < 2) errors.name = "Name must be at least 2 characters";
  if (name.length > 100) errors.name = "Name must be 100 characters or fewer";

  if (!EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address";
  if (email.length > 150) errors.email = "Email must be 150 characters or fewer";

  return { errors, values: { name, email } };
}

// Loads the target sub-admin. Returns null once it has already answered the
// request. An id that only exists in `admins` is not found here, which is the
// point: main admin rows cannot be changed from this screen.
async function loadEditableSubAdmin(req, res) {
  const account = await SubAdminModel.findById(req.params.id);

  if (!account) {
    res.status(404).json({ message: "Sub-admin not found" });
    return null;
  }

  return account;
}

// @route GET /api/admins
async function listAdmins(req, res) {
  try {
    const { search = "", status = "all" } = req.query;

    const rows = await findPanelAccounts({
      search: String(search).trim().slice(0, 80),
      status,
    });
    const counts = await countPanelAccounts();

    res.json({ accounts: rows.map(toAccount), counts, currentAdminId: req.user.id });
  } catch (error) {
    console.error("listAdmins failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route GET /api/admins/:id?role=admin|subadmin
// Defaults to a sub-admin, since that is all this screen can act on.
async function getAdmin(req, res) {
  try {
    const model = req.query.role === ROLES.ADMIN ? AdminModel : SubAdminModel;
    const account = await model.findById(req.params.id);

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    res.json({ account: toAccount(account) });
  } catch (error) {
    console.error("getAdmin failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route POST /api/admins
// Creates a sub-admin. Which table the row goes in is what makes it a
// sub-admin, so no payload can create a second main admin.
async function createSubAdmin(req, res) {
  try {
    const { errors, values } = validateAccount(req.body);
    const password = String(req.body.password || "");

    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }

    if (Object.keys(errors).length) {
      return res.status(400).json({ message: "Please correct the highlighted fields", errors });
    }

    // Checked against every account table, so a sub-admin can't reuse the
    // admin's or a user's address.
    if (await emailTakenAnywhere(values.email)) {
      return res.status(409).json({
        message: "An account with this email already exists",
        errors: { email: "An account with this email already exists" },
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const id = await SubAdminModel.create({
      name: values.name,
      email: values.email,
      password: hashedPassword,
      createdBy: req.user.id,
    });

    const account = await SubAdminModel.findById(id);

    res.status(201).json({ message: "Sub-admin created successfully", account: toAccount(account) });
  } catch (error) {
    console.error("createSubAdmin failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route PUT /api/admins/:id
// Name/email, plus an optional new password.
async function updateSubAdmin(req, res) {
  try {
    const existing = await loadEditableSubAdmin(req, res);
    if (!existing) return;

    const { errors, values } = validateAccount(req.body);
    const password = String(req.body.password || "");

    // Left blank means "keep the current password".
    if (password && password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }

    if (Object.keys(errors).length) {
      return res.status(400).json({ message: "Please correct the highlighted fields", errors });
    }

    const taken = await emailTakenAnywhere(values.email, {
      excludeRole: ROLES.SUB_ADMIN,
      excludeId: existing.id,
    });

    if (taken) {
      return res.status(409).json({
        message: "An account with this email already exists",
        errors: { email: "An account with this email already exists" },
      });
    }

    await SubAdminModel.updateProfile(existing.id, values);

    if (password) {
      await SubAdminModel.updatePassword(existing.id, await bcrypt.hash(password, 10));
    }

    const account = await SubAdminModel.findById(existing.id);

    res.json({ message: "Sub-admin updated successfully", account: toAccount(account) });
  } catch (error) {
    console.error("updateSubAdmin failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route PUT /api/admins/:id/status   body: { active: true | false }
// Deactivating takes effect immediately: the auth middleware re-checks this
// flag on every request, so a token already in the sub-admin's browser stops
// working straight away.
async function setSubAdminStatus(req, res) {
  try {
    const existing = await loadEditableSubAdmin(req, res);
    if (!existing) return;

    const active = req.body.active === true || req.body.active === "true";

    await SubAdminModel.setActive(existing.id, active);
    const account = await SubAdminModel.findById(existing.id);

    res.json({
      message: active ? "Sub-admin activated" : "Sub-admin deactivated",
      account: toAccount(account),
    });
  } catch (error) {
    console.error("setSubAdminStatus failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route DELETE /api/admins/:id
// There is no "you cannot delete yourself" check any more: only the main admin
// reaches this route, and their row is in a different table from every row it
// can touch, so they can never be the target.
async function deleteSubAdmin(req, res) {
  try {
    const existing = await loadEditableSubAdmin(req, res);
    if (!existing) return;

    await SubAdminModel.remove(existing.id);

    res.json({
      message: `${existing.name} has been deleted`,
      id: existing.id,
      key: `${ROLES.SUB_ADMIN}-${existing.id}`,
    });
  } catch (error) {
    console.error("deleteSubAdmin failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

module.exports = {
  listAdmins,
  getAdmin,
  createSubAdmin,
  updateSubAdmin,
  setSubAdminStatus,
  deleteSubAdmin,
};
