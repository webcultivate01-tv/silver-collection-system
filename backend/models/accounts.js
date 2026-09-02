// The one place that knows which account table a role lives in.
//
// Ids are only unique inside their own table now, so "id 3" means nothing on
// its own - it is always (role, id). Everything that has a role in hand goes
// through modelForRole(); the few things that only have an email (login,
// forgot password) go through the lookups further down, which ask each table
// in turn.

const AdminModel = require("./adminModel");
const SubAdminModel = require("./subAdminModel");
const UserModel = require("./userModel");

// role -> the table it lives in.
const MODELS_BY_ROLE = {
  admin: AdminModel,
  subadmin: SubAdminModel,
  user: UserModel,
};

// The order emails are searched in, and the order the admin list is built in.
const ALL_MODELS = [AdminModel, SubAdminModel, UserModel];

// The models an admin-panel screen deals with: the main admin, then sub-admins.
const PANEL_MODELS = [AdminModel, SubAdminModel];

// Returns the model for a role, or null for a role we don't know (a tampered
// or very old token).
function modelForRole(role) {
  return MODELS_BY_ROLE[role] || null;
}

// Emails have to stay unique across every account table, not just within one,
// or a login would find two different accounts for the same address. MySQL
// can't enforce that across tables, so it is checked here before every insert
// and every email change.
async function emailTakenAnywhere(email, { excludeRole = null, excludeId = null } = {}) {
  for (const model of ALL_MODELS) {
    const exclude = model.role === excludeRole ? excludeId : null;
    if (await model.emailTaken(email, exclude)) return true;
  }
  return false;
}

// Find an account by email in any table. Used by login and forgot-password,
// which are handed an email and have to work out for themselves what it is.
// The returned row carries `role`, so the caller knows which table it came from.
async function findByEmailAnywhere(email) {
  for (const model of ALL_MODELS) {
    const account = await model.findByEmail(email);
    if (account) return account;
  }
  return null;
}

// Every admin-panel account (main admin + sub-admins), with the main admin(s)
// always at the top and the newest sub-admins first below them - the same
// order the single-table query used to produce.
async function findPanelAccounts({ search = "", status = "all" } = {}) {
  const lists = await Promise.all(
    PANEL_MODELS.map((model) => model.findAll({ search, status }))
  );
  return lists.flat();
}

async function countPanelAccounts() {
  const [admins, subAdmins] = await Promise.all([
    AdminModel.countByStatus(),
    SubAdminModel.countByStatus(),
  ]);

  return {
    admins: admins.total,
    subAdmins: subAdmins.total,
    activeSubAdmins: subAdmins.active,
    inactiveSubAdmins: subAdmins.inactive,
  };
}

module.exports = {
  AdminModel,
  SubAdminModel,
  UserModel,
  modelForRole,
  emailTakenAnywhere,
  findByEmailAnywhere,
  findPanelAccounts,
  countPanelAccounts,
};
