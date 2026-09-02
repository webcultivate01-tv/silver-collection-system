// The `users` table: plain users of the portal at /user.
//
// It used to hold the admins and sub-admins too, told apart by a `role`
// column. They now have their own tables (see sql/migrations/006), so "users"
// here means exactly one thing.

const createAccountModel = require("./accountModel");

const UserModel = createAccountModel({ table: "users", role: "user" });

module.exports = UserModel;
