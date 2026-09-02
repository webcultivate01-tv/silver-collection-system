// All SQL for a "managed user": a row in `users` that an employee registered
// from the employee panel's User Management screen.
//
// These are ordinary users - the same table the portal at /user signs in to,
// and the same id a purchase is recorded against - so nothing here creates a
// new kind of account. What this file adds on top of models/userModel.js (the
// shared account factory, which only knows name/email/password) is the fuller
// record an employee fills in, the uploaded documents, and the employee who
// owns the row.
//
// Ownership is `created_by_employee_id`. Passing an employeeId into findAll()
// is what keeps one employee's users out of another employee's list; the admin
// passes nothing and sees all of them.

const { pool } = require("../config/db");

// Everything except the password hash and the OTP columns.
const SAFE_COLUMNS = `
  u.id, u.name, u.first_name, u.last_name, u.email, u.mobile, u.age, u.address,
  u.aadhaar_number, u.pan_number, u.date_of_birth, u.is_active,
  u.created_by_employee_id, u.folder_name, u.profile_image, u.aadhaar_front,
  u.aadhaar_back, u.pan_front, u.created_at, u.updated_at
`;

// Who added the user, so the admin's list can show it without a second query.
const EMPLOYEE_COLUMNS = `
  e.full_name AS employee_name, e.employee_code AS employee_code
`;

const FROM_USERS = `
  FROM users u
  LEFT JOIN employees e ON e.id = u.created_by_employee_id
`;

const ManagedUserModel = {
  // employeeId = null means "every user", which is the admin's view. Passing an
  // id limits the list to that employee's own users - what the employee panel
  // always does.
  async findAll({ employeeId = null, search = "", status = "all" } = {}) {
    const conditions = [];
    const params = [];

    if (employeeId) {
      conditions.push("u.created_by_employee_id = ?");
      params.push(employeeId);
    }

    if (search) {
      conditions.push("(u.name LIKE ? OR u.email LIKE ? OR u.mobile LIKE ?)");
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    if (status === "active") conditions.push("u.is_active = 1");
    if (status === "inactive") conditions.push("u.is_active = 0");

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `SELECT ${SAFE_COLUMNS}, ${EMPLOYEE_COLUMNS} ${FROM_USERS} ${where}
        ORDER BY u.created_at DESC`,
      params
    );
    return rows;
  },

  // The caller compares created_by_employee_id with the signed-in employee, so
  // this stays a plain lookup by id.
  async findById(id) {
    const [rows] = await pool.query(
      `SELECT ${SAFE_COLUMNS}, ${EMPLOYEE_COLUMNS} ${FROM_USERS} WHERE u.id = ?`,
      [id]
    );
    return rows[0] || null;
  },

  async countByStatus(employeeId = null) {
    const where = employeeId ? "WHERE created_by_employee_id = ?" : "";
    const params = employeeId ? [employeeId] : [];

    const [rows] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(is_active = 1) AS active,
         SUM(is_active = 0) AS inactive
       FROM users ${where}`,
      params
    );

    return {
      total: Number(rows[0].total) || 0,
      active: Number(rows[0].active) || 0,
      inactive: Number(rows[0].inactive) || 0,
    };
  },

  // One row per employee with how many users they have added. This is what
  // fills the admin's "Added by" filter, so employees with no users yet are
  // listed too (hence the LEFT JOIN).
  async countsByEmployee() {
    const [rows] = await pool.query(
      `SELECT e.id, e.employee_code, e.full_name, COUNT(u.id) AS users
         FROM employees e
         LEFT JOIN users u ON u.created_by_employee_id = e.id
        GROUP BY e.id, e.employee_code, e.full_name
        ORDER BY e.full_name`
    );

    return rows.map((row) => ({
      id: row.id,
      employeeCode: row.employee_code,
      fullName: row.full_name,
      users: Number(row.users) || 0,
    }));
  },

  // Every employee with the state of their client book: how many users they
  // have, and how much silver those users are holding between them.
  //
  // This is the first screen of the admin's payout flow - "pick the employee"
  // - and the silver figure is what makes that pick informed rather than
  // blind, because an employee whose clients hold nothing has nothing to pay
  // out.
  //
  // The three figures are subqueries rather than joins on purpose. Joining
  // silver_purchases and silver_sales in one statement multiplies the rows
  // against each other - a client with 3 purchases and 2 sales would be
  // counted 6 times on both sides - and the sums would come out silently,
  // confidently wrong. Correlated subqueries each stand on their own.
  async silverByEmployee() {
    const [rows] = await pool.query(
      `SELECT
         e.id, e.employee_code, e.full_name, e.is_blocked,
         (SELECT COUNT(*) FROM users u
           WHERE u.created_by_employee_id = e.id) AS users,
         (SELECT COUNT(*) FROM users u
           WHERE u.created_by_employee_id = e.id AND u.is_active = 1) AS active_users,
         (SELECT COALESCE(SUM(p.grams), 0) FROM silver_purchases p
            JOIN users u ON u.id = p.user_id
           WHERE u.created_by_employee_id = e.id) AS bought_grams,
         (SELECT COALESCE(SUM(sl.grams), 0) FROM silver_sales sl
            JOIN users u ON u.id = sl.user_id
           WHERE u.created_by_employee_id = e.id) AS sold_grams
       FROM employees e
       ORDER BY e.full_name`
    );

    return rows;
  },

  async emailTaken(email, excludeId = null) {
    const params = [email];
    let sql = "SELECT id FROM users WHERE email = ?";

    if (excludeId) {
      sql += " AND id <> ?";
      params.push(excludeId);
    }

    const [rows] = await pool.query(sql, params);
    return rows.length > 0;
  },

  async aadhaarTaken(aadhaarNumber, excludeId = null) {
    const params = [aadhaarNumber];
    let sql = "SELECT id FROM users WHERE aadhaar_number = ?";

    if (excludeId) {
      sql += " AND id <> ?";
      params.push(excludeId);
    }

    const [rows] = await pool.query(sql, params);
    return rows.length > 0;
  },

  // Same rule as the Aadhaar number: one PAN belongs to one person. Users
  // registered before the PAN number was asked for hold NULL, which never
  // counts as taken.
  async panTaken(panNumber, excludeId = null) {
    if (!panNumber) return false;

    const params = [panNumber];
    let sql = "SELECT id FROM users WHERE pan_number = ?";

    if (excludeId) {
      sql += " AND id <> ?";
      params.push(excludeId);
    }

    const [rows] = await pool.query(sql, params);
    return rows.length > 0;
  },

  // Used when picking the on-disk folder, so two users never share one.
  async folderNameTaken(folderName, excludeId = null) {
    const params = [folderName];
    let sql = "SELECT id FROM users WHERE folder_name = ?";

    if (excludeId) {
      sql += " AND id <> ?";
      params.push(excludeId);
    }

    const [rows] = await pool.query(sql, params);
    return rows.length > 0;
  },

  async create({
    fullName,
    firstName,
    lastName,
    email,
    mobile,
    age,
    address,
    aadhaarNumber,
    // Absent on a seeded user, so it is stored as NULL rather than "".
    panNumber = null,
    dateOfBirth,
    folderName,
    password,
    employeeId,
  }) {
    const [result] = await pool.query(
      `INSERT INTO users
         (name, first_name, last_name, email, mobile, age, address,
          aadhaar_number, pan_number, date_of_birth, folder_name, password,
          created_by_employee_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        // `name` is what the portal, the counter screen and every report show,
        // so it is kept in step with the two halves of the name.
        fullName,
        firstName,
        lastName,
        email,
        mobile,
        age,
        address,
        aadhaarNumber,
        panNumber || null,
        dateOfBirth,
        folderName,
        password,
        employeeId,
      ]
    );
    return result.insertId;
  },

  async update(id, {
    fullName,
    firstName,
    lastName,
    email,
    mobile,
    age,
    address,
    aadhaarNumber,
    panNumber = null,
    dateOfBirth,
    folderName,
  }) {
    await pool.query(
      `UPDATE users
          SET name = ?, first_name = ?, last_name = ?, email = ?, mobile = ?, age = ?,
              address = ?, aadhaar_number = ?, pan_number = ?, date_of_birth = ?,
              folder_name = ?
        WHERE id = ?`,
      [
        fullName,
        firstName,
        lastName,
        email,
        mobile,
        age,
        address,
        aadhaarNumber,
        panNumber || null,
        dateOfBirth,
        folderName,
        id,
      ]
    );
  },

  // paths is a { column: "/uploads/user/..." } map built by utils/userFiles.js,
  // holding only the documents that were actually uploaded this time.
  async updateDocuments(id, paths = {}) {
    const columns = Object.keys(paths);
    if (columns.length === 0) return;

    const assignments = columns.map((column) => `${column} = ?`).join(", ");
    await pool.query(
      `UPDATE users SET ${assignments} WHERE id = ?`,
      [...columns.map((column) => paths[column]), id]
    );
  },

  async updatePassword(id, hashedPassword) {
    await pool.query("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, id]);
  },

  async setActive(id, active) {
    await pool.query("UPDATE users SET is_active = ? WHERE id = ?", [active ? 1 : 0, id]);
  },

  // Only used to roll a registration back when saving the documents fails - a
  // half-registered user would be worse than none. Users are never deleted from
  // the panels, because the purchase ledger points at them.
  async remove(id) {
    await pool.query("DELETE FROM users WHERE id = ?", [id]);
  },
};

module.exports = ManagedUserModel;
