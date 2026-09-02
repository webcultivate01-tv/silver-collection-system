// Creates one MySQL connection pool that the whole app shares.
// A "pool" hands out connections as needed instead of opening a new
// connection for every query, which is faster and safer.

// Configured via DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD in .env
// (not committed) - see .env.example for the shape.

const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  // DATE columns (date_of_birth, rate_date) are calendar days, not instants.
  // Returning them as "YYYY-MM-DD" strings avoids the driver converting them
  // to local-midnight Date objects that shift a day once serialised to UTC.
  dateStrings: ["DATE"],
});

// Quick check so we fail fast with a clear message if MySQL isn't reachable.
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log("MySQL connected successfully");
    connection.release();
  } catch (error) {
    console.error("MySQL connection failed:", error.message);
    process.exit(1);
  }
}

module.exports = { pool, testConnection };
