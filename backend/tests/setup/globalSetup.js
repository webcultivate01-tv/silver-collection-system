// Runs once, before any test file. Rebuilds the test schema from scratch so a
// run never inherits state from the run before it.

const { config: loadEnv } = require("dotenv");

loadEnv({ path: ".env.test" });
loadEnv({ path: ".env" });

const { rebuildTestDatabase } = require("./schema");

export async function setup() {
  const database = await rebuildTestDatabase();

  // Applied over the freshly built schema. Everything should be ADOPTED (the
  // @applied-if markers recognising the column already exists), not applied -
  // if a migration actually runs here, schema.sql is missing something that
  // migration adds, which is worth knowing about.
  process.env.DB_NAME = database;
  const { runMigrations } = require("../../config/migrate");
  const { applied, adopted } = await runMigrations({ log: () => {} });

  if (applied.length) {
    console.warn(
      `\n  Note: ${applied.length} migration(s) had to be APPLIED on top of schema.sql ` +
        `(${applied.join(", ")}).\n  That means sql/schema.sql is behind sql/migrations/.\n`
    );
  }

  console.log(`  Test database ready: ${database} (${adopted.length} migrations adopted)`);
}
