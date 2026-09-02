// The `sub_admins` table: accounts the main admin creates from Admin
// Management. They sign in at /admin like the main admin does, but only get
// the read-only reporting dashboard.
//
// `created_by` holds the id of the admin who created the account, which is why
// this is the one account table asking for that column.

const createAccountModel = require("./accountModel");

const SubAdminModel = createAccountModel({
  table: "sub_admins",
  role: "subadmin",
  hasCreatedBy: true,
});

module.exports = SubAdminModel;
