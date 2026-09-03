// All SQL for "enquiries" - the messages left on the public contact form.
//
// One table, no transactions: an enquiry is written once by a visitor and then
// only ever moved along a three-step status by the panel. What it does share
// with cash_settlements is who touched it - `handled_by` is (role, id), and
// the name has to be looked up in whichever account table the role names,
// because ids restart at 1 in each.

const { pool } = require("../config/db");
const { rowLimit } = require("../utils/requestParams");

const ENQUIRY_COLUMNS = `
  e.id, e.name, e.email, e.phone, e.message, e.status, e.admin_note,
  e.handled_by, e.handled_by_role, e.handled_at, e.emailed, e.created_at, e.updated_at,
  COALESCE(a.name, sa.name) AS handled_by_name
`;

// Joining on the role as well as the id means at most one of the two can
// match, and COALESCE takes whichever one did.
const ENQUIRY_JOINS = `
  FROM enquiries e
  LEFT JOIN admins a ON a.id = e.handled_by AND e.handled_by_role = 'admin'
  LEFT JOIN sub_admins sa ON sa.id = e.handled_by AND e.handled_by_role = 'subadmin'
`;

const NEWEST_FIRST = "ORDER BY e.created_at DESC, e.id DESC";

const STATUSES = ["new", "in_progress", "closed"];

const EnquiryModel = {
  STATUSES,

  // The public form. `emailed` is set afterwards by markEmailed(), because the
  // row has to exist before the mail is attempted - that is the whole point of
  // storing it.
  async create({ name, email, phone, message }) {
    const [result] = await pool.query(
      "INSERT INTO enquiries (name, email, phone, message) VALUES (?, ?, ?, ?)",
      [name, email, phone, message]
    );
    return result.insertId;
  },

  async markEmailed(id) {
    await pool.query("UPDATE enquiries SET emailed = 1 WHERE id = ?", [id]);
  },

  async findById(id) {
    const [rows] = await pool.query(
      `SELECT ${ENQUIRY_COLUMNS} ${ENQUIRY_JOINS} WHERE e.id = ?`,
      [id]
    );
    return rows[0] || null;
  },

  // The panel's Enquiries screen. `status` is the tab, `search` the box above
  // the list, and `from`/`to` narrow it to when the enquiry came in - each end
  // of the range stands on its own.
  async listAll({ status = "all", search = "", from = "", to = "", limit = 200 } = {}) {
    const conditions = [];
    const params = [];

    if (STATUSES.includes(status)) {
      conditions.push("e.status = ?");
      params.push(status);
    }

    if (search) {
      conditions.push("(e.name LIKE ? OR e.email LIKE ? OR e.phone LIKE ? OR e.message LIKE ?)");
      // Escaped so an admin searching for "100%" doesn't match every row.
      const term = `%${search.replace(/[%_\\]/g, "\\$&")}%`;
      params.push(term, term, term, term);
    }

    if (from) {
      conditions.push("e.created_at >= ?");
      params.push(`${from} 00:00:00`);
    }

    if (to) {
      conditions.push("e.created_at <= ?");
      params.push(`${to} 23:59:59`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `SELECT ${ENQUIRY_COLUMNS} ${ENQUIRY_JOINS} ${where} ${NEWEST_FIRST} LIMIT ?`,
      [...params, rowLimit(limit, 200)]
    );
    return rows;
  },

  // The counts behind the tabs, over the whole table rather than the current
  // filter - a tab that only counted what is already on screen would always
  // read the same as the list under it.
  async counts() {
    const [rows] = await pool.query("SELECT status, COUNT(*) AS count FROM enquiries GROUP BY status");

    const counts = { total: 0, new: 0, in_progress: 0, closed: 0 };

    for (const row of rows) {
      const count = Number(row.count) || 0;
      counts[row.status] = count;
      counts.total += count;
    }

    return counts;
  },

  // Moving an enquiry along, and the note that goes with it.
  //
  // `note` left undefined keeps whatever note is already there - the status
  // buttons on the list send only a status, and they must not wipe a note
  // somebody typed on the detail panel.
  //
  // Returns false when there is no such row, so the controller can answer 404
  // rather than a silent success.
  async update(id, { status, note, handledBy }) {
    const assignments = ["status = ?", "handled_by = ?", "handled_by_role = ?", "handled_at = NOW()"];
    const params = [status, handledBy.id, handledBy.role];

    if (note !== undefined) {
      assignments.push("admin_note = ?");
      // An emptied box means "there is no note", not an empty string.
      params.push(note || null);
    }

    const [result] = await pool.query(
      `UPDATE enquiries SET ${assignments.join(", ")} WHERE id = ?`,
      [...params, id]
    );

    return result.affectedRows > 0;
  },

  async remove(id) {
    const [result] = await pool.query("DELETE FROM enquiries WHERE id = ?", [id]);
    return result.affectedRows > 0;
  },
};

module.exports = EnquiryModel;
