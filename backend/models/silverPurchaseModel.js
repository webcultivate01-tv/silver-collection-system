// All SQL for the "silver_purchases" table - the ledger of what each customer
// has bought.
//
// Nothing here recomputes a weight. `grams` is written once, when the payment
// is taken, and every total below is a SUM of that stored column - so a
// customer's balance can never drift with the rate.

const { pool } = require("../config/db");

// A purchase joined to the names that make it readable. The customer's name
// comes from `users`, the counter staff's from `employees`; a LEFT JOIN keeps
// the row readable even if the employee has since been deleted.
const PURCHASE_COLUMNS = `
  p.id, p.user_id, p.employee_id, p.amount_paid, p.rate_per_gram, p.grams,
  p.purchased_on, p.created_at, p.payment_status, p.settlement_id,
  u.name AS customer_name, u.email AS customer_email,
  e.full_name AS employee_name, e.employee_code
`;

const PURCHASE_JOINS = `
  FROM silver_purchases p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN employees e ON e.id = p.employee_id
`;

// Newest purchase first; two on the same day are broken by id so the order is
// stable rather than whatever MySQL happens to return.
const NEWEST_FIRST = "ORDER BY p.purchased_on DESC, p.id DESC";

// The admin's Employee Collections view needs two things the ledger columns
// above don't carry: how to reach the client a payment came from, and which
// cash handover it ended up in - "collected from whom, and where did it go".
const COLLECTION_COLUMNS = `
  p.id, p.user_id, p.employee_id, p.amount_paid, p.rate_per_gram, p.grams,
  p.purchased_on, p.created_at, p.payment_status, p.settlement_id,
  u.name AS customer_name, u.email AS customer_email, u.mobile AS customer_mobile,
  u.profile_image AS customer_image, u.created_by_employee_id,
  e.full_name AS employee_name, e.employee_code,
  s.settlement_date, s.status AS settlement_status, s.accepted_at
`;

const COLLECTION_JOINS = `
  FROM silver_purchases p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN employees e ON e.id = p.employee_id
  LEFT JOIN cash_settlements s ON s.id = p.settlement_id
`;

// One WHERE for the three queries behind that screen - the row list, the
// per-client roll-up and the totals above them. They must filter identically
// or the totals would stop adding up to the rows underneath them.
function collectionWhere(employeeId, { from = "", to = "", status = "all", search = "" } = {}) {
  const conditions = ["p.employee_id = ?"];
  const params = [employeeId];

  if (from) {
    conditions.push("p.purchased_on >= ?");
    params.push(from);
  }

  if (to) {
    conditions.push("p.purchased_on <= ?");
    params.push(to);
  }

  if (status === "pending" || status === "success") {
    conditions.push("p.payment_status = ?");
    params.push(status);
  }

  if (search) {
    conditions.push("(u.name LIKE ? OR u.email LIKE ? OR u.mobile LIKE ?)");
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  return { where: `WHERE ${conditions.join(" AND ")}`, params };
}


const SilverPurchaseModel = {
  async create({ userId, employeeId, amountPaid, ratePerGram, grams, purchasedOn }) {
    const [result] = await pool.query(
      `INSERT INTO silver_purchases
         (user_id, employee_id, amount_paid, rate_per_gram, grams, purchased_on)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, employeeId || null, amountPaid, ratePerGram, grams, purchasedOn]
    );
    return result.insertId;
  },

  async findById(id) {
    const [rows] = await pool.query(
      `SELECT ${PURCHASE_COLUMNS} ${PURCHASE_JOINS} WHERE p.id = ?`,
      [id]
    );
    return rows[0] || null;
  },

  // One customer's history.
  async listForUser(userId, { limit = 100 } = {}) {
    const [rows] = await pool.query(
      `SELECT ${PURCHASE_COLUMNS} ${PURCHASE_JOINS} WHERE p.user_id = ? ${NEWEST_FIRST} LIMIT ?`,
      [userId, limit]
    );
    return rows;
  },

  // What one member of staff has taken at the counter.
  async listForEmployee(employeeId, { limit = 100 } = {}) {
    const [rows] = await pool.query(
      `SELECT ${PURCHASE_COLUMNS} ${PURCHASE_JOINS} WHERE p.employee_id = ? ${NEWEST_FIRST} LIMIT ?`,
      [employeeId, limit]
    );
    return rows;
  },

  // What this employee has collected but not yet handed to the admin -
  // settlement_id IS NULL means "not bundled into a handover yet".
  async listUnsettledForEmployee(employeeId, { limit = 500 } = {}) {
    const [rows] = await pool.query(
      `SELECT ${PURCHASE_COLUMNS} ${PURCHASE_JOINS}
        WHERE p.employee_id = ? AND p.settlement_id IS NULL
        ${NEWEST_FIRST} LIMIT ?`,
      [employeeId, limit]
    );
    return rows;
  },

  // The count + rupee total behind the "hand over cash" button - cheaper than
  // pulling every row just to add them up.
  async unsettledTotalsForEmployee(employeeId) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount_paid), 0) AS total
         FROM silver_purchases WHERE employee_id = ? AND settlement_id IS NULL`,
      [employeeId]
    );
    const row = rows[0] || {};
    return { count: Number(row.count) || 0, total: Number(row.total) || 0 };
  },

  // Every purchase one handover bundled, for the admin to review before
  // accepting the cash.
  async listForSettlement(settlementId) {
    const [rows] = await pool.query(
      `SELECT ${PURCHASE_COLUMNS} ${PURCHASE_JOINS} WHERE p.settlement_id = ? ${NEWEST_FIRST}`,
      [settlementId]
    );
    return rows;
  },

  // Every purchase, for the admin panel and the sub-admin report.
  // `search` matches the customer's name or email.
  // Built once and used by BOTH the row list and the totals above it. They
  // have to filter identically, or the figures at the top of the screen stop
  // describing the table underneath them - which is exactly what happened
  // before totals() took any filters at all.
  buildWhere({ search = "", from = "", to = "" } = {}) {
    const conditions = [];
    const params = [];

    if (search) {
      conditions.push("(u.name LIKE ? OR u.email LIKE ?)");
      const like = `%${search}%`;
      params.push(like, like);
    }

    if (from) {
      conditions.push("p.purchased_on >= ?");
      params.push(from);
    }

    if (to) {
      conditions.push("p.purchased_on <= ?");
      params.push(to);
    }

    return {
      where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
      params,
    };
  },

  async listAll({ limit = 200, ...filters } = {}) {
    const { where, params } = this.buildWhere(filters);

    const [rows] = await pool.query(
      `SELECT ${PURCHASE_COLUMNS} ${PURCHASE_JOINS} ${where} ${NEWEST_FIRST} LIMIT ?`,
      [...params, limit]
    );
    return rows;
  },

  // A customer's holding: the SUM of what was stored, never a re-calculation.
  // COALESCE keeps a customer who has bought nothing at 0 rather than null.
  async totalsForUser(userId) {
    const [rows] = await pool.query(
      `SELECT
         COUNT(*) AS purchases,
         COALESCE(SUM(grams), 0) AS total_grams,
         COALESCE(SUM(amount_paid), 0) AS total_paid,
         MAX(purchased_on) AS last_purchase_on
       FROM silver_purchases WHERE user_id = ?`,
      [userId]
    );

    const row = rows[0] || {};

    return {
      purchases: Number(row.purchases) || 0,
      totalGrams: Number(row.total_grams) || 0,
      totalPaid: Number(row.total_paid) || 0,
      lastPurchaseOn: row.last_purchase_on || null,
    };
  },

  // What a set of customers has bought, in one query - the buy side of
  // utils/holding.js's loadHoldings(). Returns a Map keyed by user id; a
  // customer with no purchases is absent, which the caller reads as zero.
  async totalsForUsers(userIds = []) {
    const ids = userIds.map(Number).filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length === 0) return new Map();

    const [rows] = await pool.query(
      `SELECT
         user_id,
         COUNT(*) AS purchases,
         COALESCE(SUM(grams), 0) AS total_grams,
         COALESCE(SUM(amount_paid), 0) AS total_paid,
         MAX(purchased_on) AS last_purchase_on
       FROM silver_purchases
       WHERE user_id IN (?)
       GROUP BY user_id`,
      [ids]
    );

    return new Map(
      rows.map((row) => [
        Number(row.user_id),
        {
          purchases: Number(row.purchases) || 0,
          totalGrams: Number(row.total_grams) || 0,
          totalPaid: Number(row.total_paid) || 0,
          lastPurchaseOn: row.last_purchase_on || null,
        },
      ])
    );
  },

  // ---------------------------------------------------------------------
  // Employee Collections: the same rows, read from the employee's side.
  //
  // "Collections" is what the admin calls the cash an employee has taken at
  // the counter - one row per payment, so the questions this answers are
  // "how much has this employee collected?" and "from which client?".
  // ---------------------------------------------------------------------

  // Everything the collections screen shows about one payment: the client it
  // came from (with their contact details, so the admin can follow it up) and
  // the handover it was bundled into, if any.
  async listCollectionsForEmployee(employeeId, filters = {}) {
    const { where, params } = collectionWhere(employeeId, filters);
    const limit = Math.min(Number(filters.limit) || 500, 1000);

    const [rows] = await pool.query(
      `SELECT ${COLLECTION_COLUMNS} ${COLLECTION_JOINS} ${where} ${NEWEST_FIRST} LIMIT ?`,
      [...params, limit]
    );
    return rows;
  },

  // The same rows folded up one line per client - who this employee collects
  // from, and how much of the total each of them is.
  async collectionsByClientForEmployee(employeeId, filters = {}) {
    const { where, params } = collectionWhere(employeeId, filters);

    const [rows] = await pool.query(
      `SELECT
         u.id AS user_id, u.name, u.email, u.mobile, u.profile_image,
         COUNT(*) AS collections,
         COALESCE(SUM(p.amount_paid), 0) AS total_amount,
         COALESCE(SUM(p.grams), 0) AS total_grams,
         COALESCE(SUM(CASE WHEN p.payment_status = 'pending' THEN p.amount_paid ELSE 0 END), 0)
           AS pending_amount,
         SUM(CASE WHEN p.payment_status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
         MIN(p.purchased_on) AS first_on,
         MAX(p.purchased_on) AS last_on
       ${COLLECTION_JOINS} ${where}
       GROUP BY u.id, u.name, u.email, u.mobile, u.profile_image
       ORDER BY total_amount DESC, u.name ASC`,
      params
    );
    return rows;
  },

  // The headline figures above those two tables. Split by payment_status so
  // the admin can see what is still owed to them at a glance.
  async collectionTotalsForEmployee(employeeId, filters = {}) {
    const { where, params } = collectionWhere(employeeId, filters);

    const [rows] = await pool.query(
      `SELECT
         COUNT(*) AS collections,
         COUNT(DISTINCT p.user_id) AS clients,
         COALESCE(SUM(p.amount_paid), 0) AS total_amount,
         COALESCE(SUM(p.grams), 0) AS total_grams,
         COALESCE(SUM(CASE WHEN p.payment_status = 'pending' THEN p.amount_paid ELSE 0 END), 0)
           AS pending_amount,
         SUM(CASE WHEN p.payment_status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
         COALESCE(SUM(CASE WHEN p.payment_status = 'success' THEN p.amount_paid ELSE 0 END), 0)
           AS settled_amount,
         SUM(CASE WHEN p.payment_status = 'success' THEN 1 ELSE 0 END) AS settled_count,
         MIN(p.purchased_on) AS first_on,
         MAX(p.purchased_on) AS last_on
       ${COLLECTION_JOINS} ${where}`,
      params
    );

    const row = rows[0] || {};

    return {
      collections: Number(row.collections) || 0,
      clients: Number(row.clients) || 0,
      totalAmount: Number(row.total_amount) || 0,
      totalGrams: Number(row.total_grams) || 0,
      pendingAmount: Number(row.pending_amount) || 0,
      pendingCount: Number(row.pending_count) || 0,
      settledAmount: Number(row.settled_amount) || 0,
      settledCount: Number(row.settled_count) || 0,
      firstOn: row.first_on || null,
      lastOn: row.last_on || null,
    };
  },

  // One unfiltered row per employee who has ever collected, for the picker on
  // the Employee Collections screen - so the admin sees each employee's
  // running total before choosing one. Keyed by employee_id in a Map, since
  // the caller matches it against the employee list.
  async collectionSummaryByEmployee() {
    const [rows] = await pool.query(
      `SELECT
         employee_id,
         COUNT(*) AS collections,
         COUNT(DISTINCT user_id) AS clients,
         COALESCE(SUM(amount_paid), 0) AS total_amount,
         COALESCE(SUM(grams), 0) AS total_grams,
         COALESCE(SUM(CASE WHEN payment_status = 'pending' THEN amount_paid ELSE 0 END), 0)
           AS pending_amount,
         MAX(purchased_on) AS last_on
       FROM silver_purchases
       WHERE employee_id IS NOT NULL
       GROUP BY employee_id`
    );

    return new Map(
      rows.map((row) => [
        Number(row.employee_id),
        {
          collections: Number(row.collections) || 0,
          clients: Number(row.clients) || 0,
          totalAmount: Number(row.total_amount) || 0,
          totalGrams: Number(row.total_grams) || 0,
          pendingAmount: Number(row.pending_amount) || 0,
          lastOn: row.last_on || null,
        },
      ])
    );
  },

  // ---------------------------------------------------------------------
  // The employee's own Monthly Collection screen.
  //
  // The same rows once more, but read by the employee themselves rather than
  // the admin, and folded up one line per calendar month. There is no client
  // search here - this only answers "how much did I take in each month" - so
  // it stays on silver_purchases alone and needs none of the COLLECTION_JOINS.
  // ---------------------------------------------------------------------

  // One row per month this employee collected anything in, newest first. A
  // month they took nothing in simply has no row; the screen fills those gaps
  // in itself so a year still reads as twelve months.
  async monthlyCollectionsForEmployee(employeeId, { year = "" } = {}) {
    const conditions = ["employee_id = ?"];
    const params = [employeeId];

    if (year) {
      conditions.push("YEAR(purchased_on) = ?");
      params.push(Number(year));
    }

    const [rows] = await pool.query(
      `SELECT
         DATE_FORMAT(purchased_on, '%Y-%m') AS month,
         COUNT(*) AS collections,
         COUNT(DISTINCT user_id) AS clients,
         COALESCE(SUM(amount_paid), 0) AS total_amount,
         COALESCE(SUM(grams), 0) AS total_grams,
         COALESCE(SUM(CASE WHEN payment_status = 'pending' THEN amount_paid ELSE 0 END), 0)
           AS pending_amount,
         SUM(CASE WHEN payment_status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
         COALESCE(SUM(CASE WHEN payment_status = 'success' THEN amount_paid ELSE 0 END), 0)
           AS settled_amount,
         MIN(purchased_on) AS first_on,
         MAX(purchased_on) AS last_on
       FROM silver_purchases
       WHERE ${conditions.join(" AND ")}
       GROUP BY month
       ORDER BY month DESC`,
      params
    );

    return rows;
  },

  // Which years this employee has anything in, for the year picker - so it
  // only ever offers years that will actually show something.
  async collectionYearsForEmployee(employeeId) {
    const [rows] = await pool.query(
      `SELECT DISTINCT YEAR(purchased_on) AS year
       FROM silver_purchases
       WHERE employee_id = ?
       ORDER BY year DESC`,
      [employeeId]
    );

    return rows.map((row) => Number(row.year)).filter(Boolean);
  },

  // Headline figures for a dashboard.
  // Filtered by exactly the same WHERE the row list uses. Called with no
  // filters it covers every purchase ever made, which is what the unfiltered
  // screen wants.
  async totals(filters = {}) {
    const { where, params } = this.buildWhere(filters);

    const [rows] = await pool.query(
      `SELECT
         COUNT(*) AS purchases,
         COUNT(DISTINCT p.user_id) AS customers,
         COALESCE(SUM(p.grams), 0) AS total_grams,
         COALESCE(SUM(p.amount_paid), 0) AS total_paid
       ${PURCHASE_JOINS} ${where}`,
      params
    );

    const row = rows[0] || {};

    return {
      purchases: Number(row.purchases) || 0,
      customers: Number(row.customers) || 0,
      totalGrams: Number(row.total_grams) || 0,
      totalPaid: Number(row.total_paid) || 0,
    };
  },
};

module.exports = SilverPurchaseModel;
