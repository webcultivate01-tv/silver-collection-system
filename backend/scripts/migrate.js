// Run with: npm run migrate          - apply any pending migrations
//           npm run migrate:status   - just show what is applied and what isn't
//
// The server does this automatically on startup too; this is for when you want
// to migrate without booting the app, or to see the current state.

require("dotenv").config();
const { pool } = require("../config/db");
const { runMigrations, migrationFiles } = require("../config/migrate");

async function showStatus() {
  let rows = [];

  try {
    [rows] = await pool.query("SELECT name, applied_at FROM schema_migrations ORDER BY name");
  } catch (error) {
    // Nothing has ever been migrated on this database - everything is pending.
    if (error.code !== "ER_NO_SUCH_TABLE") throw error;
  }

  const applied = new Map(rows.map((row) => [row.name, row.applied_at]));

  console.log("Migrations:");
  for (const file of migrationFiles()) {
    const at = applied.get(file);
    console.log(at ? `  [x] ${file}  (${at.toISOString()})` : `  [ ] ${file}  PENDING`);
  }
}

async function main() {
  const statusOnly = process.argv.includes("--status");

  try {
    if (statusOnly) {
      await showStatus();
      return;
    }

    const { applied, adopted, alreadyDone } = await runMigrations();

    if (adopted.length) {
      console.log(`Adopted (already present in the database): ${adopted.join(", ")}`);
    }

    if (applied.length) {
      console.log(`Applied: ${applied.join(", ")}`);
    }

    console.log(
      `Done. ${applied.length} applied, ${adopted.length} adopted, ${alreadyDone} already up to date.`
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
