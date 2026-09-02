// All SQL for the "employees" table.

const { pool } = require("../config/db");

// Columns that are safe to return to the client (never the password hash).
// pan_back is deliberately absent: only the front of the PAN card is collected
// now, and the old back-side scans are no longer shown anywhere.
const SAFE_COLUMNS = `
  id, employee_code, first_name, last_name, full_name, mobile, alternate_mobile, email, age,
  address, aadhaar_number, pan_number, date_of_birth, folder_name, profile_photo,
  aadhaar_front, aadhaar_back, pan_front, must_change_password, is_blocked, blocked_at,
  created_at, updated_at
`;

const EmployeeModel = {
  // Includes the password hash - only used during employee login.
  async findByEmail(email) {
    const [rows] = await pool.query("SELECT * FROM employees WHERE email = ?", [email]);
    return rows[0] || null;
  },

  async findById(id) {
    const [rows] = await pool.query(`SELECT ${SAFE_COLUMNS} FROM employees WHERE id = ?`, [id]);
    return rows[0] || null;
  },

  async findAll({ search = "", status = "all" } = {}) {
    const conditions = [];
    const params = [];

    if (search) {
      conditions.push(
        "(first_name LIKE ? OR last_name LIKE ? OR full_name LIKE ? OR email LIKE ? OR mobile LIKE ? OR employee_code LIKE ?)"
      );
      const like = `%${search}%`;
      params.push(like, like, like, like, like, like);
    }

    if (status === "active") conditions.push("is_blocked = 0");
    if (status === "blocked") conditions.push("is_blocked = 1");

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `SELECT ${SAFE_COLUMNS} FROM employees ${where} ORDER BY created_at DESC`,
      params
    );
    return rows;
  },

  // Returns the conflicting row (if any) so the controller can say which field clashed.
  async findConflict({ email, aadhaarNumber, panNumber, excludeId = null }) {
    // An empty PAN would match every row registered before it was asked for,
    // so only look for it when one was actually given.
    const params = [email, aadhaarNumber];
    let sql =
      "SELECT id, email, aadhaar_number, pan_number FROM employees WHERE (email = ? OR aadhaar_number = ?";

    if (panNumber) {
      sql += " OR pan_number = ?";
      params.push(panNumber);
    }

    sql += ")";

    if (excludeId) {
      sql += " AND id <> ?";
      params.push(excludeId);
    }

    const [rows] = await pool.query(sql, params);
    return rows[0] || null;
  },

  // Used when picking the on-disk folder name, so two people with the same
  // name never share a folder.
  async folderNameTaken(folderName, excludeId = null) {
    const params = [folderName];
    let sql = "SELECT id FROM employees WHERE folder_name = ?";

    if (excludeId) {
      sql += " AND id <> ?";
      params.push(excludeId);
    }

    const [rows] = await pool.query(sql, params);
    return rows.length > 0;
  },

  async create({
    firstName,
    lastName,
    fullName,
    mobile,
    alternateMobile,
    email,
    age,
    address,
    aadhaarNumber,
    panNumber,
    dateOfBirth,
    folderName,
    password,
  }) {
    const [result] = await pool.query(
      `INSERT INTO employees
         (first_name, last_name, full_name, mobile, alternate_mobile, email, age, address,
          aadhaar_number, pan_number, date_of_birth, folder_name, password)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        firstName,
        lastName,
        fullName,
        mobile,
        // Optional - stored as NULL rather than "" so the column stays tidy.
        alternateMobile || null,
        email,
        age,
        address,
        aadhaarNumber,
        panNumber,
        dateOfBirth,
        folderName,
        password,
      ]
    );
    return result.insertId;
  },

  // The readable employee ID (EMP0007). Derived from the row id, so it is
  // assigned right after the insert.
  async setEmployeeCode(id, employeeCode) {
    await pool.query("UPDATE employees SET employee_code = ? WHERE id = ?", [employeeCode, id]);
  },

  async update(id, {
    firstName,
    lastName,
    fullName,
    mobile,
    alternateMobile,
    email,
    age,
    address,
    aadhaarNumber,
    panNumber,
    dateOfBirth,
    folderName,
  }) {
    await pool.query(
      `UPDATE employees
         SET first_name = ?, last_name = ?, full_name = ?, mobile = ?, alternate_mobile = ?,
             email = ?, age = ?, address = ?, aadhaar_number = ?, pan_number = ?,
             date_of_birth = ?, folder_name = ?
       WHERE id = ?`,
      [
        firstName,
        lastName,
        fullName,
        mobile,
        alternateMobile || null,
        email,
        age,
        address,
        aadhaarNumber,
        panNumber,
        dateOfBirth,
        folderName,
        id,
      ]
    );
  },

  // paths is a { column: "/uploads/..." } map built by utils/employeeFiles.js,
  // holding only the documents that were actually uploaded this time.
  async updateDocuments(id, paths = {}) {
    const columns = Object.keys(paths);
    if (columns.length === 0) return;

    const assignments = columns.map((column) => `${column} = ?`).join(", ");
    await pool.query(
      `UPDATE employees SET ${assignments} WHERE id = ?`,
      [...columns.map((column) => paths[column]), id]
    );
  },

  // mustChange is true for admin-issued temp passwords, false once the employee picks their own.
  async updatePassword(id, hashedPassword, mustChange) {
    await pool.query(
      "UPDATE employees SET password = ?, must_change_password = ? WHERE id = ?",
      [hashedPassword, mustChange ? 1 : 0, id]
    );
  },

  // Save a freshly generated OTP + its expiry (employee "Forgot Password" - step 1)
  // The OTP arrives already hashed - see utils/generateOtp.js. A new code gets
  // a fresh set of attempts.
  async setResetOtp(id, otp, expiresAt) {
    await pool.query(
      `UPDATE employees
          SET reset_otp = ?, reset_otp_expires = ?, reset_otp_attempts = 0
        WHERE id = ?`,
      [otp, expiresAt, id]
    );
  },

  // A wrong guess; returns how many have been made, so the caller can retire
  // the code after too many.
  async recordOtpFailure(id) {
    await pool.query(
      "UPDATE employees SET reset_otp_attempts = reset_otp_attempts + 1 WHERE id = ?",
      [id]
    );

    const [rows] = await pool.query(
      "SELECT reset_otp_attempts FROM employees WHERE id = ?",
      [id]
    );
    return Number(rows[0]?.reset_otp_attempts) || 0;
  },

  // Clear the OTP once it has been used (or expired) so it can't be reused
  async clearResetOtp(id) {
    await pool.query(
      "UPDATE employees SET reset_otp = NULL, reset_otp_expires = NULL WHERE id = ?",
      [id]
    );
  },

  async setBlocked(id, blocked) {
    await pool.query(
      "UPDATE employees SET is_blocked = ?, blocked_at = ? WHERE id = ?",
      [blocked ? 1 : 0, blocked ? new Date() : null, id]
    );
  },

  async remove(id) {
    await pool.query("DELETE FROM employees WHERE id = ?", [id]);
  },

  async countByStatus() {
    const [rows] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(is_blocked = 0) AS active,
         SUM(is_blocked = 1) AS blocked
       FROM employees`
    );
    return {
      total: Number(rows[0].total) || 0,
      active: Number(rows[0].active) || 0,
      blocked: Number(rows[0].blocked) || 0,
    };
  },
};

module.exports = EmployeeModel;
