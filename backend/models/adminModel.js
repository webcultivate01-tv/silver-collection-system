// The `admins` table: the main admin account(s), signed in at /admin.
// All the SQL lives in models/accountModel.js, which every account table shares.

const createAccountModel = require("./accountModel");

const AdminModel = createAccountModel({ table: "admins", role: "admin" });

module.exports = AdminModel;
