// All SQL for the "silver_sales" table - the ledger of what each customer has
// sold back.
//
// Like silver_purchases, nothing here recomputes a weight or an amount: both
// are written once, at the moment of sale, and every total below is a SUM of
// those stored columns.
//
// The one write that needs care is `create`. A sale must never take out more
// silver than the customer holds, and "how much do they hold" is itself a sum
// over two tables - so the check and the insert run inside one transaction
// with `FOR UPDATE` over both, or a customer tapping "Record Sale" twice could
// sell the same gram of silver two ways.

const { pool } = require("../config/db");

const SALE_COLUMNS = `
  s.id, s.user_id, s.employee_id, s.recorded_by_admin_id, s.grams,
  s.rate_per_gram, s.amount_payable, s.payout_kind, s.sold_on, s.created_at, s.payout_status,
  s.approved_by, s.approved_at, s.request_id,
  u.name AS customer_name, u.email AS customer_email, u.mobile AS customer_mobile,
  u.created_by_employee_id AS customer_employee_id,
  e.full_name AS employee_name, e.employee_code,
  o.full_name AS owner_employee_name, o.employee_code AS owner_employee_code,
  a.name AS approved_by_name,
  r.name AS recorded_by_admin_name
`;

// `e` is who stood at the counter; `o` is the employee who owns the customer,
// which is the only employee an admin payout has - nobody is at the counter
// for one of those, so without `o` an admin payout could not be reported
// under the employee it belongs to.
const SALE_JOINS = `
  FROM silver_sales s
  JOIN users u ON u.id = s.user_id
  LEFT JOIN employees e ON e.id = s.employee_id
  LEFT JOIN employees o ON o.id = u.created_by_employee_id
  LEFT JOIN admins a ON a.id = s.approved_by
  LEFT JOIN admins r ON r.id = s.recorded_by_admin_id
`;

// Newest sale first; two on the same day are broken by id so the order is
// stable rather than whatever MySQL happens to return.
const NEWEST_FIRST = "ORDER BY s.sold_on DESC, s.id DESC";

const SilverSaleModel = {
  // Records a sale, but only if the customer actually holds that much silver.
  //
  // Returns { id, available, duplicate } on success, or { id: null, available }
  // when the request was for more than they hold - the caller turns that into
  // the "they only hold X" message, so the number in the error is the same
  // number the check used.
  //
  // Two callers, one row:
  //
  //   the counter  employeeId set, payoutStatus left at 'pending' - the cash
  //                waits for an admin to approve it;
  //   the panel    recordedByAdminId set, payoutStatus 'paid' and approvedBy
  //                the same admin, because the person recording it IS the
  //                person paying it out. Doing both in this one transaction is
  //                deliberate: inserting a pending row and approving it in a
  //                second call would leave a payout the admin has already
  //                handed cash for sitting as "unpaid" if anything failed in
  //                between.
  //
  // `requestId` makes an admin payout repeat-safe. The holding check below
  // stops an OVERdraw, but it cannot tell a double click apart from two
  // genuine payouts of the same size - both are within the holding, so both
  // are valid to it. One id per confirmed payout, unique in the database, is
  // what makes the second attempt return the FIRST payout instead of creating
  // another one.
  async create({
    userId,
    employeeId,
    recordedByAdminId = null,
    grams,
    ratePerGram,
    amountPayable,
    soldOn,
    // What the customer walks away with: 'cash' at the counter, 'coin' when
    // the admin hands them a silver coin from the panel.
    payoutKind = "cash",
    payoutStatus = "pending",
    approvedBy = null,
    requestId = null,
  }) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Already done? Hand back the payout that was made, not a second one.
      if (requestId) {
        const [seen] = await connection.query(
          "SELECT id FROM silver_sales WHERE request_id = ?",
          [requestId]
        );

        if (seen[0]) {
          await connection.rollback();
          return { id: seen[0].id, available: null, duplicate: true };
        }
      }

      // Both tables are locked in the same order every time - purchases, then
      // sales - so two sales racing for one customer queue up instead of
      // deadlocking.
      const [boughtRows] = await connection.query(
        "SELECT COALESCE(SUM(grams), 0) AS total FROM silver_purchases WHERE user_id = ? FOR UPDATE",
        [userId]
      );
      const [soldRows] = await connection.query(
        "SELECT COALESCE(SUM(grams), 0) AS total FROM silver_sales WHERE user_id = ? FOR UPDATE",
        [userId]
      );

      const available = Number(boughtRows[0].total) - Number(soldRows[0].total);

      // Compared at storage precision: a holding of 2.000000 g must be allowed
      // to sell 2.000000 g, and nothing finer than a microgram exists here.
      if (Number(grams) > Number(available.toFixed(6))) {
        await connection.rollback();
        return { id: null, available };
      }

      // 'paid' is written together with who approved it and when, so a paid
      // row can never exist without the admin's name against it.
      const paid = payoutStatus === "paid";

      const [result] = await connection.query(
        `INSERT INTO silver_sales
           (user_id, employee_id, recorded_by_admin_id, grams, rate_per_gram,
            amount_payable, payout_kind, sold_on, payout_status, approved_by,
            approved_at, request_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${paid ? "NOW()" : "NULL"}, ?)`,
        [
          userId,
          employeeId || null,
          recordedByAdminId || null,
          grams,
          ratePerGram,
          amountPayable,
          payoutKind === "coin" ? "coin" : "cash",
          soldOn,
          paid ? "paid" : "pending",
          paid ? approvedBy || null : null,
          requestId || null,
        ]
      );

      await connection.commit();
      return { id: result.insertId, available, duplicate: false };
    } catch (error) {
      await connection.rollback();

      // Two identical confirmations arriving at once: both got past the read
      // above, and the unique index stopped the second. That is the retry
      // working as intended, so answer it the same way - with the payout that
      // did go through.
      if (error.code === "ER_DUP_ENTRY" && requestId) {
        const [rows] = await pool.query(
          "SELECT id FROM silver_sales WHERE request_id = ?",
          [requestId]
        );
        if (rows[0]) return { id: rows[0].id, available: null, duplicate: true };
      }

      throw error;
    } finally {
      connection.release();
    }
  },

  // The admin paying the customer out. Returns "approved", "already_paid" or
  // "not_found", the same three-way answer CashSettlementModel.accept gives.
  async approve(id, adminId) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] = await connection.query(
        "SELECT id, payout_status FROM silver_sales WHERE id = ? FOR UPDATE",
        [id]
      );
      const sale = rows[0];

      if (!sale) {
        await connection.rollback();
        return "not_found";
      }

      if (sale.payout_status === "paid") {
        await connection.rollback();
        return "already_paid";
      }

      await connection.query(
        `UPDATE silver_sales SET payout_status = 'paid', approved_by = ?, approved_at = NOW()
          WHERE id = ?`,
        [adminId, id]
      );

      await connection.commit();
      return "approved";
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async findById(id) {
    const [rows] = await pool.query(
      `SELECT ${SALE_COLUMNS} ${SALE_JOINS} WHERE s.id = ?`,
      [id]
    );
    return rows[0] || null;
  },

  // One customer's sell-back history.
  async listForUser(userId, { limit = 100 } = {}) {
    const [rows] = await pool.query(
      `SELECT ${SALE_COLUMNS} ${SALE_JOINS} WHERE s.user_id = ? ${NEWEST_FIRST} LIMIT ?`,
      [userId, limit]
    );
    return rows;
  },

  // What one member of staff has paid out at the counter.
  async listForEmployee(employeeId, { limit = 100 } = {}) {
    const [rows] = await pool.query(
      `SELECT ${SALE_COLUMNS} ${SALE_JOINS} WHERE s.employee_id = ? ${NEWEST_FIRST} LIMIT ?`,
      [employeeId, limit]
    );
    return rows;
  },

  // ---------------------------------------------------------------------
  // The payout history, and the filters behind it.
  //
  // `where` is built once and used by both the row list and the totals under
  // it. They must filter identically or the totals would stop adding up to the
  // rows they sit beneath - the kind of mismatch nobody notices until an admin
  // is reconciling cash at the end of a day.
  // ---------------------------------------------------------------------

  // `search`     matches the customer's name, email or mobile.
  // `status`     'pending' | 'paid'.
  // `employeeId' is the employee the CUSTOMER belongs to, not the one at the
  //              counter: an admin payout has no counter employee, so
  //              filtering on s.employee_id would hide exactly the rows this
  //              screen exists to show.
  // `source`     'admin'   - paid by the admin from the panel
  //              'counter' - recorded by an employee at the counter
  buildWhere({
    search = "",
    status = "all",
    from = "",
    to = "",
    employeeId = null,
    source = "all",
    kind = "all",
  } = {}) {
    const conditions = [];
    const params = [];

    if (search) {
      conditions.push("(u.name LIKE ? OR u.email LIKE ? OR u.mobile LIKE ?)");
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    if (status === "pending" || status === "paid") {
      conditions.push("s.payout_status = ?");
      params.push(status);
    }

    if (from) {
      conditions.push("s.sold_on >= ?");
      params.push(from);
    }

    if (to) {
      conditions.push("s.sold_on <= ?");
      params.push(to);
    }

    if (employeeId) {
      conditions.push("u.created_by_employee_id = ?");
      params.push(employeeId);
    }

    if (kind === "coin" || kind === "cash") {
      conditions.push("s.payout_kind = ?");
      params.push(kind);
    }

    if (source === "admin") {
      conditions.push("s.recorded_by_admin_id IS NOT NULL");
    } else if (source === "counter") {
      conditions.push("s.recorded_by_admin_id IS NULL");
    }

    return {
      where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
      params,
    };
  },

  // Every sale, for the admin's payout queue and the sub-admin report.
  async listAll({ limit = 200, ...filters } = {}) {
    const { where, params } = this.buildWhere(filters);

    const [rows] = await pool.query(
      `SELECT ${SALE_COLUMNS} ${SALE_JOINS} ${where} ${NEWEST_FIRST} LIMIT ?`,
      [...params, limit]
    );
    return rows;
  },

  // What one customer has sold back, for the net-holding sum.
  async totalsForUser(userId) {
    const [rows] = await pool.query(
      `SELECT
         COUNT(*) AS sales,
         COALESCE(SUM(grams), 0) AS total_grams,
         COALESCE(SUM(amount_payable), 0) AS total_payable,
         MAX(sold_on) AS last_sale_on
       FROM silver_sales WHERE user_id = ?`,
      [userId]
    );

    const row = rows[0] || {};

    return {
      sales: Number(row.sales) || 0,
      totalGrams: Number(row.total_grams) || 0,
      totalPayable: Number(row.total_payable) || 0,
      lastSaleOn: row.last_sale_on || null,
    };
  },

  // What a set of customers has sold back, in one query.
  //
  // The payout screen lists an employee's whole client book with each one's
  // holding beside it, and asking totalsForUser() per row would be one query
  // per customer. Returns a Map keyed by user id; a customer with no sales is
  // simply absent, and the caller reads that as zero.
  async totalsForUsers(userIds = []) {
    const ids = userIds.map(Number).filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length === 0) return new Map();

    const [rows] = await pool.query(
      `SELECT
         user_id,
         COUNT(*) AS sales,
         COALESCE(SUM(grams), 0) AS total_grams,
         COALESCE(SUM(amount_payable), 0) AS total_payable,
         MAX(sold_on) AS last_sale_on
       FROM silver_sales
       WHERE user_id IN (?)
       GROUP BY user_id`,
      [ids]
    );

    return new Map(
      rows.map((row) => [
        Number(row.user_id),
        {
          sales: Number(row.sales) || 0,
          totalGrams: Number(row.total_grams) || 0,
          totalPayable: Number(row.total_payable) || 0,
          lastSaleOn: row.last_sale_on || null,
        },
      ])
    );
  },

  // Headline figures for the admin's payout screen.
  //
  // Filtered by exactly the same WHERE the row list uses, so the figures above
  // a table always describe the table underneath it. Called with no filters it
  // covers every sale ever made.
  async totals(filters = {}) {
    const { where, params } = this.buildWhere(filters);

    const [rows] = await pool.query(
      `SELECT
         COUNT(*) AS sales,
         COUNT(DISTINCT s.user_id) AS customers,
         COALESCE(SUM(s.grams), 0) AS total_grams,
         COALESCE(SUM(s.amount_payable), 0) AS total_payable,
         COALESCE(SUM(CASE WHEN s.payout_status = 'pending' THEN s.amount_payable END), 0) AS pending_payable,
         COALESCE(SUM(CASE WHEN s.payout_status = 'paid' THEN s.amount_payable END), 0) AS paid_payable,
         COALESCE(SUM(CASE WHEN s.payout_status = 'paid' THEN s.grams END), 0) AS paid_grams,
         COALESCE(SUM(s.payout_status = 'pending'), 0) AS pending_count,
         COALESCE(SUM(s.recorded_by_admin_id IS NOT NULL), 0) AS admin_count,
         COALESCE(SUM(s.payout_kind = 'coin'), 0) AS coin_count,
         COALESCE(SUM(CASE WHEN s.payout_kind = 'coin' THEN s.grams END), 0) AS coin_grams,
         COALESCE(SUM(CASE WHEN s.payout_kind = 'coin' THEN s.amount_payable END), 0) AS coin_value,
         COALESCE(SUM(CASE WHEN s.payout_kind = 'cash' AND s.payout_status = 'paid'
                           THEN s.amount_payable END), 0) AS cash_paid
       ${SALE_JOINS} ${where}`,
      params
    );

    const row = rows[0] || {};

    return {
      sales: Number(row.sales) || 0,
      customers: Number(row.customers) || 0,
      totalGrams: Number(row.total_grams) || 0,
      totalPayable: Number(row.total_payable) || 0,
      pendingPayable: Number(row.pending_payable) || 0,
      paidPayable: Number(row.paid_payable) || 0,
      paidGrams: Number(row.paid_grams) || 0,
      pendingCount: Number(row.pending_count) || 0,
      adminCount: Number(row.admin_count) || 0,
      coinCount: Number(row.coin_count) || 0,
      coinGrams: Number(row.coin_grams) || 0,
      // What the coins were worth. A valuation, never money owed - see
      // migration 015.
      coinValue: Number(row.coin_value) || 0,
      // Money that actually left the till: approved counter sell-backs only.
      cashPaid: Number(row.cash_paid) || 0,
    };
  },
};

module.exports = SilverSaleModel;
