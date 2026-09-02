// One factory, three account tables.
//
// `admins`, `sub_admins` and `users` are separate tables so each can change on
// its own, but they all answer the same questions: find by email, find by id,
// change the password, run the Forgot Password OTP. Rather than writing that
// SQL out three times, this builds a model for a given table.
//
// Adding a fourth kind of account later is: one CREATE TABLE, then one line
//   module.exports = createAccountModel({ table: "managers", role: "manager" });
//
// The table/role passed in are constants written by us, never user input, so
// dropping them straight into the SQL string is safe; every value still goes
// through a `?` placeholder.

const { pool } = require("../config/db");

function createAccountModel({ table, role, hasCreatedBy = false }) {
  // Columns that are safe to hand back to the client - never the password hash
  // and never the OTP columns.
  //
  // `role` is no longer a column (which table the row is in is what decides
  // it), so it is selected as a constant. Everything downstream - the JWT, the
  // frontend, the auth middleware - still sees the same `role` field it always
  // did.
  const SAFE_COLUMNS = `
    id, name, email, is_active, ${hasCreatedBy ? "created_by," : ""} profile_image,
    created_at, updated_at, '${role}' AS role
  `;

  return {
    role,
    table,

    // Includes the password hash and the OTP columns - only for login and the
    // password/OTP checks, never for a response.
    async findByEmail(email) {
      const [rows] = await pool.query(
        `SELECT *, '${role}' AS role FROM ${table} WHERE email = ?`,
        [email]
      );
      return rows[0] || null;
    },

    // Same, by id (used by "change my password", which knows the id from the JWT).
    async findByIdWithPassword(id) {
      const [rows] = await pool.query(
        `SELECT *, '${role}' AS role FROM ${table} WHERE id = ?`,
        [id]
      );
      return rows[0] || null;
    },

    // Used to load the signed-in account's profile and by the auth middleware
    // to re-check on every request that the account still exists and is active.
    async findById(id) {
      const [rows] = await pool.query(
        `SELECT ${SAFE_COLUMNS} FROM ${table} WHERE id = ?`,
        [id]
      );
      return rows[0] || null;
    },

    // Newest first. `search` matches name or email; `status` filters on is_active.
    async findAll({ search = "", status = "all" } = {}) {
      const conditions = [];
      const params = [];

      if (search) {
        conditions.push("(name LIKE ? OR email LIKE ?)");
        const like = `%${search}%`;
        params.push(like, like);
      }

      if (status === "active") conditions.push("is_active = 1");
      if (status === "inactive") conditions.push("is_active = 0");

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

      const [rows] = await pool.query(
        `SELECT ${SAFE_COLUMNS} FROM ${table} ${where} ORDER BY created_at DESC`,
        params
      );
      return rows;
    },

    async create({ name, email, password, createdBy = null }) {
      const columns = ["name", "email", "password"];
      const values = [name, email, password];

      if (hasCreatedBy) {
        columns.push("created_by");
        values.push(createdBy);
      }

      const [result] = await pool.query(
        `INSERT INTO ${table} (${columns.join(", ")})
         VALUES (${columns.map(() => "?").join(", ")})`,
        values
      );
      return result.insertId;
    },

    async updateProfile(id, { name, email }) {
      await pool.query(`UPDATE ${table} SET name = ?, email = ? WHERE id = ?`, [name, email, id]);
    },

    async updatePassword(id, hashedPassword) {
      await pool.query(`UPDATE ${table} SET password = ? WHERE id = ?`, [hashedPassword, id]);
    },

    async updateProfileImage(id, imagePath) {
      await pool.query(`UPDATE ${table} SET profile_image = ? WHERE id = ?`, [imagePath, id]);
    },

    // Save a freshly generated OTP + its expiry time (Forgot Password - step 1)
    // The OTP arrives already hashed - see utils/generateOtp.js. Issuing a new
    // one resets the attempt counter, so a fresh code gets a fresh five tries.
    async setResetOtp(id, otp, expiresAt) {
      await pool.query(
        `UPDATE ${table}
            SET reset_otp = ?, reset_otp_expires = ?, reset_otp_attempts = 0
          WHERE id = ?`,
        [otp, expiresAt, id]
      );
    },

    // A wrong guess. Returns the number of attempts made so far, so the caller
    // can retire the code once there have been too many. Done as one statement
    // rather than read-then-write so two simultaneous guesses both count.
    async recordOtpFailure(id) {
      await pool.query(
        `UPDATE ${table} SET reset_otp_attempts = reset_otp_attempts + 1 WHERE id = ?`,
        [id]
      );

      const [rows] = await pool.query(
        `SELECT reset_otp_attempts FROM ${table} WHERE id = ?`,
        [id]
      );
      return Number(rows[0]?.reset_otp_attempts) || 0;
    },

    // Clear the OTP once it has been used (or expired) so it can't be reused
    async clearResetOtp(id) {
      await pool.query(
        `UPDATE ${table} SET reset_otp = NULL, reset_otp_expires = NULL WHERE id = ?`,
        [id]
      );
    },

    // Is this email already in THIS table? Uniqueness across all the account
    // tables is checked by models/accounts.js - see emailTakenAnywhere().
    async emailTaken(email, excludeId = null) {
      const params = [email];
      let sql = `SELECT id FROM ${table} WHERE email = ?`;

      if (excludeId) {
        sql += " AND id <> ?";
        params.push(excludeId);
      }

      const [rows] = await pool.query(sql, params);
      return rows.length > 0;
    },

    async setActive(id, active) {
      await pool.query(`UPDATE ${table} SET is_active = ? WHERE id = ?`, [active ? 1 : 0, id]);
    },

    async remove(id) {
      await pool.query(`DELETE FROM ${table} WHERE id = ?`, [id]);
    },

    async countByStatus() {
      const [rows] = await pool.query(
        `SELECT
           COUNT(*) AS total,
           SUM(is_active = 1) AS active,
           SUM(is_active = 0) AS inactive
         FROM ${table}`
      );
      return {
        total: Number(rows[0].total) || 0,
        active: Number(rows[0].active) || 0,
        inactive: Number(rows[0].inactive) || 0,
      };
    },
  };
}

module.exports = createAccountModel;
