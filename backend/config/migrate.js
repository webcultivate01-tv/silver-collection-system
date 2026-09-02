// Keeps the database schema in step with the code, automatically.
//
// Every file in sql/migrations/ runs exactly once, in filename order, and the
// name is then written to a `schema_migrations` table so it never runs again.
// The server calls this on startup, so a migration someone forgot to apply by
// hand simply gets applied the next time the app boots - the schema can't
// silently fall behind the code any more.
//
// ---------------------------------------------------------------------------
// The "@applied-if" marker
// ---------------------------------------------------------------------------
// A migration file may declare, in a comment near the top, how to tell whether
// its change is *already present* in the database:
//
//   -- @applied-if: column users.is_active
//   -- @applied-if: table employees
//
// Before running a migration the runner checks that marker. If the column or
// table is already there, the migration is recorded as applied and skipped
// rather than executed. That matters in two everyday cases:
//
//   * A brand-new database created from sql/schema.sql already has every
//     column, so all the old migrations must be skipped, not replayed.
//   * A database that was migrated by hand (as this project's was) gets
//     adopted correctly instead of erroring with "Duplicate column name".
//
// A migration without a marker is simply always run when it isn't recorded yet.

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const MIGRATIONS_DIR = path.join(__dirname, "..", "sql", "migrations");

// Only one process may migrate at a time - `npm run dev` restarting while
// `npm run migrate` is running would otherwise race.
const LOCK_NAME = "silver_schema_migration";
const LOCK_TIMEOUT_SECONDS = 30;

function connectionOptions() {
  return {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    // Migration files hold several statements each.
    multipleStatements: true,
  };
}

function migrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort(); // "001_", "002_", ... - the numeric prefix is what orders them.
}

// Pulls "-- @applied-if: column users.is_active" out of a migration's comments.
function readMarker(sql) {
  const match = sql.match(/^\s*--\s*@applied-if:\s*(column|table)\s+([\w.]+)\s*$/im);
  if (!match) return null;
  return { kind: match[1].toLowerCase(), target: match[2] };
}

// Is the thing the marker describes already in the database?
async function markerSatisfied(connection, marker, database) {
  if (marker.kind === "table") {
    const [rows] = await connection.query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = ? AND table_name = ? LIMIT 1`,
      [database, marker.target]
    );
    return rows.length > 0;
  }

  const [table, column] = marker.target.split(".");

  if (!table || !column) {
    throw new Error(
      `Bad @applied-if marker "${marker.target}" - expected "column <table>.<column>"`
    );
  }

  const [rows] = await connection.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1`,
    [database, table, column]
  );
  return rows.length > 0;
}

// A `USE some_db;` line in a migration would override DB_NAME from .env, so
// drop them - the connection is already pointed at the right database.
function stripUseStatements(sql) {
  return sql.replace(/^\s*USE\s+[^;]+;\s*$/gim, "");
}

// Runs every migration that hasn't been recorded yet.
// Returns { applied: [...], adopted: [...], alreadyDone: n }.
async function runMigrations({ log = console.log } = {}) {
  const database = process.env.DB_NAME;
  const connection = await mysql.createConnection(connectionOptions());

  const result = { applied: [], adopted: [], alreadyDone: 0 };

  try {
    const [[lock]] = await connection.query("SELECT GET_LOCK(?, ?) AS ok", [
      LOCK_NAME,
      LOCK_TIMEOUT_SECONDS,
    ]);

    if (lock.ok !== 1) {
      throw new Error(
        "Timed out waiting for another process to finish migrating the database."
      );
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(200) NOT NULL PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const [recordedRows] = await connection.query("SELECT name FROM schema_migrations");
    const recorded = new Set(recordedRows.map((row) => row.name));

    for (const file of migrationFiles()) {
      if (recorded.has(file)) {
        result.alreadyDone += 1;
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      const marker = readMarker(sql);

      // Already present in the database - adopt it instead of replaying it.
      if (marker && (await markerSatisfied(connection, marker, database))) {
        await connection.query("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
        result.adopted.push(file);
        continue;
      }

      log(`  running ${file} ...`);

      try {
        await connection.query(stripUseStatements(sql));
      } catch (error) {
        // MySQL commits DDL as it goes, so a file that fails halfway may be
        // partly applied. Say so plainly rather than recording it as done.
        throw new Error(
          `Migration ${file} failed: ${error.message}\n` +
            `  The database may be partly changed by that file. Fix the cause, ` +
            `then run "npm run migrate" again.`
        );
      }

      await connection.query("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
      result.applied.push(file);
    }

    return result;
  } finally {
    await connection.query("SELECT RELEASE_LOCK(?)", [LOCK_NAME]).catch(() => {});
    await connection.end();
  }
}

// What the server prints on boot: quiet when there is nothing to do.
async function migrateOnStartup() {
  const { applied, adopted } = await runMigrations({ log: console.log });

  if (adopted.length) {
    console.log(`Schema: adopted ${adopted.length} migration(s) already present in the database`);
  }

  if (applied.length) {
    console.log(`Schema: applied ${applied.length} new migration(s): ${applied.join(", ")}`);
  } else {
    console.log("Schema: up to date");
  }
}

module.exports = { runMigrations, migrateOnStartup, migrationFiles };
