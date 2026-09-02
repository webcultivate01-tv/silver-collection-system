// All SQL for "cash_settlements" - the daily handover between an employee and
// the admin.
//
// The two writes that matter here - bundling an employee's unsettled
// purchases into a new handover, and the admin accepting one - each touch two
// tables (`cash_settlements` and `silver_purchases`) and must never happen
// half-done, so both run inside a transaction with `FOR UPDATE` locking the
// rows involved. Without that lock, an employee tapping "hand over cash"
// twice in a row (a slow network, a double click) could bundle the same
// purchase into two different handovers.

const { pool } = require("../config/db");
const { rowLimit } = require("../utils/requestParams");

// Who took the cash is (role, id), not an id on its own: sub-admins accept
// handovers too, and ids restart at 1 in each account table - so the name has
// to be looked up in the table the role names. Joining on the role as well as
// the id means at most one of the two joins can match, and COALESCE takes
// whichever one did.
const SETTLEMENT_COLUMNS = `
  s.id, s.employee_id, s.settlement_date, s.total_amount, s.purchase_count,
  s.status, s.accepted_by, s.accepted_by_role, s.accepted_at, s.created_at,
  e.full_name AS employee_name, e.employee_code,
  COALESCE(a.name, sa.name) AS accepted_by_name
`;

const SETTLEMENT_JOINS = `
  FROM cash_settlements s
  JOIN employees e ON e.id = s.employee_id
  LEFT JOIN admins a ON a.id = s.accepted_by AND s.accepted_by_role = 'admin'
  LEFT JOIN sub_admins sa ON sa.id = s.accepted_by AND s.accepted_by_role = 'subadmin'
`;

const NEWEST_FIRST = "ORDER BY s.created_at DESC, s.id DESC";

const CashSettlementModel = {
  async findById(id) {
    const [rows] = await pool.query(
      `SELECT ${SETTLEMENT_COLUMNS} ${SETTLEMENT_JOINS} WHERE s.id = ?`,
      [id]
    );
    return rows[0] || null;
  },

  // One employee's handovers, newest first - their own record of what they've
  // handed in and whether the admin has taken it yet.
  async listForEmployee(employeeId, { limit = 200 } = {}) {
    const [rows] = await pool.query(
      `SELECT ${SETTLEMENT_COLUMNS} ${SETTLEMENT_JOINS} WHERE s.employee_id = ? ${NEWEST_FIRST} LIMIT ?`,
      [employeeId, rowLimit(limit, 200)]
    );
    return rows;
  },

  // Every handover, for the admin's Cash Settlements screen. `date` narrows it
  // to one settlement_date (the screen's day picker) and `from`/`to` to a range
  // (the Reports card's); `employeeId` to one employee's own history - that's
  // what powers "download this employee's settlements" on the Reports page.
  // The three combine, and either end of the range stands on its own.
  async listAll({
    status = "all",
    date = "",
    from = "",
    to = "",
    employeeId = null,
    limit = 200,
  } = {}) {
    const conditions = [];
    const params = [];

    if (status === "pending" || status === "accepted") {
      conditions.push("s.status = ?");
      params.push(status);
    }

    if (date) {
      conditions.push("s.settlement_date = ?");
      params.push(date);
    }

    if (from) {
      conditions.push("s.settlement_date >= ?");
      params.push(from);
    }

    if (to) {
      conditions.push("s.settlement_date <= ?");
      params.push(to);
    }

    if (employeeId) {
      conditions.push("s.employee_id = ?");
      params.push(employeeId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `SELECT ${SETTLEMENT_COLUMNS} ${SETTLEMENT_JOINS} ${where} ${NEWEST_FIRST} LIMIT ?`,
      [...params, rowLimit(limit, 200)]
    );
    return rows;
  },

  async pendingCount() {
    const [rows] = await pool.query(
      "SELECT COUNT(*) AS count FROM cash_settlements WHERE status = 'pending'"
    );
    return Number(rows[0]?.count) || 0;
  },

  // Bundles every one of this employee's unsettled purchases into a new
  // handover. Returns the new settlement's id, or null when there was nothing
  // to hand over.
  async createFromUnsettled(employeeId, settlementDate) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [purchases] = await connection.query(
        `SELECT id, amount_paid FROM silver_purchases
          WHERE employee_id = ? AND settlement_id IS NULL
          FOR UPDATE`,
        [employeeId]
      );

      if (purchases.length === 0) {
        await connection.rollback();
        return null;
      }

      const totalAmount = purchases
        .reduce((sum, purchase) => sum + Number(purchase.amount_paid), 0)
        .toFixed(2);
      const ids = purchases.map((purchase) => purchase.id);

      const [result] = await connection.query(
        `INSERT INTO cash_settlements (employee_id, settlement_date, total_amount, purchase_count)
         VALUES (?, ?, ?, ?)`,
        [employeeId, settlementDate, totalAmount, purchases.length]
      );

      await connection.query(
        `UPDATE silver_purchases SET settlement_id = ? WHERE id IN (${ids.map(() => "?").join(",")})`,
        [result.insertId, ...ids]
      );

      await connection.commit();
      return result.insertId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  // The panel taking the cash: the settlement becomes 'accepted' and every
  // purchase it carries becomes 'success', together or not at all.
  //
  // `acceptedBy` is the whole account - { id, role } - because the id alone
  // doesn't say which table it came from. Both the main admin and a sub-admin
  // can accept, and the row records which of them did.
  // Returns "accepted", "already_accepted" or "not_found".
  async accept(id, acceptedBy) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] = await connection.query(
        "SELECT id, status FROM cash_settlements WHERE id = ? FOR UPDATE",
        [id]
      );
      const settlement = rows[0];

      if (!settlement) {
        await connection.rollback();
        return "not_found";
      }

      if (settlement.status === "accepted") {
        await connection.rollback();
        return "already_accepted";
      }

      await connection.query(
        `UPDATE cash_settlements
            SET status = 'accepted', accepted_by = ?, accepted_by_role = ?, accepted_at = NOW()
          WHERE id = ?`,
        [acceptedBy.id, acceptedBy.role, id]
      );

      await connection.query(
        `UPDATE silver_purchases SET payment_status = 'success' WHERE settlement_id = ?`,
        [id]
      );

      await connection.commit();
      return "accepted";
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },
};

module.exports = CashSettlementModel;
