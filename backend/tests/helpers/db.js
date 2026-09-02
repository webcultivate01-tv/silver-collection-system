// Resetting the database between tests.
//
// TRUNCATE rather than DROP: rebuilding the schema per test would dominate the
// run time, and truncating also resets AUTO_INCREMENT, which matters more here
// than in most projects - ids restart at 1 in every account table, and several
// tests turn on admin #1 and user #1 both existing.

const { pool } = require("../../config/db");

// Everything except schema_migrations, which records what the migrator did and
// must survive.
const TABLES = [
  "silver_sales",
  "silver_purchases",
  "cash_settlements",
  "silver_rates",
  "users",
  "employees",
  "sub_admins",
  "admins",
];

async function resetDatabase() {
  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of TABLES) {
    await pool.query(`TRUNCATE TABLE \`${table}\``);
  }
  await pool.query("SET FOREIGN_KEY_CHECKS = 1");
}

async function closePool() {
  await pool.end();
}

// Straight SQL, for assertions that need to see what is actually stored rather
// than what an endpoint chose to return.
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function countRows(table) {
  const rows = await query(`SELECT COUNT(*) AS n FROM \`${table}\``);
  return Number(rows[0].n);
}

module.exports = { resetDatabase, closePool, query, countRows, pool };
