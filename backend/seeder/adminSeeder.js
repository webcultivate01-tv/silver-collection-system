// Run with: npm run seed
// Creates the default admin account (email: admin@gmail.com, password: Admin123)
// so there's always at least one account you can log in with.

require("dotenv").config();
const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");
const { AdminModel, findByEmailAnywhere } = require("../models/accounts");

async function seedAdmin() {
  const name = process.env.ADMIN_NAME || "Tejas Mehar";
  const email = process.env.ADMIN_EMAIL || "admin@gmail.com";
  const password = process.env.ADMIN_PASSWORD || "Admin123";

  try {
    // Checked across every account table: emails have to stay unique app-wide,
    // so this also catches the address already being a user or a sub-admin.
    const existingAccount = await findByEmailAnywhere(email);

    if (existingAccount) {
      console.log(
        `An account already exists for ${email} (${existingAccount.role}). Nothing to do.`
      );
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await AdminModel.create({ name, email, password: hashedPassword });

    console.log("Admin account created successfully:");
    console.log(`  Email:    ${email}`);
    console.log(`  Password: ${password}`);
  } catch (error) {
    console.error("Failed to seed admin account:", error.message);
  } finally {
    await pool.end();
  }
}

seedAdmin();
