// Entry point of the backend.
//
// The app itself - every router, in the right order - is built in app.js.
// This file is the part that only makes sense when actually running the
// service: checking the configuration, connecting to MySQL, bringing the
// schema up to date, and listening. Splitting the two is what lets the test
// suite import the app without a database or a port.

require("dotenv").config();

const { testConnection } = require("./config/db");
const { migrateOnStartup } = require("./config/migrate");
const { createApp } = require("./app");

// A missing JWT_SECRET doesn't fail at startup on its own - jwt.sign() just
// throws the first time someone logs in, which on a VPS shows up as a
// confusing 500 on /api/auth/login with nothing in the logs pointing at the
// cause. Since every login (admin, sub-admin, user, employee) goes through
// this, check once, up front, with a message that says what to fix.
if (!process.env.JWT_SECRET) {
  console.error(
    "JWT_SECRET is not set. Add it to backend/.env (see .env.example) before starting the server."
  );
  process.exit(1);
}

const app = createApp();

const PORT = process.env.PORT || 5000;

// Connect, bring the schema up to date, then serve. Migrating before listening
// means the app never runs against a database that is missing columns the code
// expects - that used to fail in confusing ways (a missing `users.is_active`
// made every admin look deactivated).
async function start() {
  await testConnection();

  try {
    await migrateOnStartup();
  } catch (error) {
    console.error("Database migration failed, so the server did not start:");
    console.error(error.message);
    process.exit(1);
  }

  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

start();
