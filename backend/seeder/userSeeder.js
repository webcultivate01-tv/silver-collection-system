// Run with: npm run seed:user
// Creates the default user account (email: user@gmail.com, password: User123)
// so the /user login page has an account to sign in with.
//
// Each kind of account has its own table and its own login page: this one
// writes to `users`, the admin seeder writes to `admins`.

require("dotenv").config();
const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");
const { UserModel, findByEmailAnywhere } = require("../models/accounts");

async function seedUser() {
  const name = process.env.USER_NAME || "User";
  const email = process.env.USER_EMAIL || "user@gmail.com";
  const password = process.env.USER_PASSWORD || "User123";

  try {
    // Emails have to stay unique across every account table, not just `users`.
    const existingAccount = await findByEmailAnywhere(email);

    if (existingAccount) {
      console.log(
        `An account already exists for ${email} (${existingAccount.role}). Nothing to do.`
      );
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await UserModel.create({ name, email, password: hashedPassword });

    console.log("User account created successfully:");
    console.log(`  Email:    ${email}`);
    console.log(`  Password: ${password}`);
    console.log("  Sign in at /user");
  } catch (error) {
    console.error("Failed to seed user account:", error.message);
  } finally {
    await pool.end();
  }
}

seedUser();
