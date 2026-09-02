// Runs before each test file. Its only job is to make sure the environment is
// pointed at the test database before anything imports config/db.js, which
// builds its connection pool at import time from process.env.

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.test" });
loadEnv({ path: ".env" });

if (!/test/i.test(process.env.DB_NAME || "")) {
  throw new Error(
    `DB_NAME is "${process.env.DB_NAME}" - the suite truncates every table, so it ` +
      `refuses to run against a database that isn't clearly a test one.`
  );
}
