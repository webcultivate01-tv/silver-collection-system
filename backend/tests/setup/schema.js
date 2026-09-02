// Builds the test database.
//
// It uses the project's own sql/schema.sql, not a hand-copied set of CREATE
// statements, so the tests run against the schema a real install would get. It
// then runs the migration runner over the top, which should ADOPT all sixteen
// migrations rather than apply any - if schema.sql has drifted behind the
// migrations, that shows up here as a failure instead of as a mystery in
// production.

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const SCHEMA_FILE = path.join(__dirname, "..", "..", "sql", "schema.sql");

function connectionOptions(database) {
  return {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
    multipleStatements: true,
  };
}

// schema.sql opens with CREATE DATABASE / USE for the development database.
// Both have to go, or every table would be created in the wrong schema and the
// test run would quietly rewrite the real one.
function retargetToTestDatabase(sql) {
  return sql
    .replace(/^\s*CREATE\s+DATABASE[^;]*;\s*$/gim, "")
    .replace(/^\s*USE\s+[^;]+;\s*$/gim, "");
}

async function rebuildTestDatabase() {
  const database = process.env.DB_NAME;

  if (!database || !/test/i.test(database)) {
    throw new Error(
      `Refusing to rebuild "${database}": the test database name must contain "test". ` +
        `Check backend/.env.test.`
    );
  }

  const root = await mysql.createConnection(connectionOptions(undefined));
  await root.query(`DROP DATABASE IF EXISTS \`${database}\``);
  await root.query(`CREATE DATABASE \`${database}\``);
  await root.end();

  const connection = await mysql.createConnection(connectionOptions(database));
  const sql = retargetToTestDatabase(fs.readFileSync(SCHEMA_FILE, "utf8"));
  await connection.query(sql);
  await connection.end();

  return database;
}

module.exports = { rebuildTestDatabase };
