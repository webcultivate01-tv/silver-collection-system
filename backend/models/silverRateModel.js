// All SQL for the "silver_rates" table (one row per day, two rates per row).

const { pool } = require("../config/db");
const { rowLimit } = require("../utils/requestParams");

const SilverRateModel = {
  // rate_date is UNIQUE, so saving the same day twice updates that day's row.
  //
  // The three new values are passed a second time for the UPDATE half rather
  // than read back with VALUES(col). MySQL deprecated that function in 8.0.20
  // and warns on every call that it will be removed; the replacement it
  // suggests - a row alias - is itself only understood from 8.0.19 on, so
  // naming the values twice is what works on every server this might meet.
  async upsertForDate({ rateDate, buyRatePerGram, sellRatePerGram, updatedBy }) {
    const updatedById = updatedBy || null;

    await pool.query(
      `INSERT INTO silver_rates
         (rate_date, buy_rate_per_gram, sell_rate_per_gram, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         buy_rate_per_gram  = ?,
         sell_rate_per_gram = ?,
         updated_by         = ?`,
      [
        rateDate,
        buyRatePerGram,
        sellRatePerGram,
        updatedById,
        buyRatePerGram,
        sellRatePerGram,
        updatedById,
      ]
    );
  },

  // The two most recent rates: [latest, previous]. Used to show the change.
  async getLatestPair() {
    const [rows] = await pool.query(
      "SELECT * FROM silver_rates ORDER BY rate_date DESC LIMIT 2"
    );
    return { latest: rows[0] || null, previous: rows[1] || null };
  },

  // `search` powers the "find that day's rate" box: it matches the date in
  // both the stored (2026-08-10) and the displayed (10 Aug 2026) form.
  //
  // `from` / `to` are the report's date range. Either end stands on its own,
  // so "everything since April" and "everything up to April" both work.
  async listRecent({ limit = 30, search = "", from = "", to = "" } = {}) {
    const conditions = [];
    const params = [];

    if (search) {
      const like = `%${search}%`;
      conditions.push(`(
        DATE_FORMAT(rate_date, '%Y-%m-%d') LIKE ?
        OR DATE_FORMAT(rate_date, '%d %b %Y') LIKE ?
        OR DATE_FORMAT(rate_date, '%d/%m/%Y') LIKE ?
      )`);
      params.push(like, like, like);
    }

    if (from) {
      conditions.push("rate_date >= ?");
      params.push(from);
    }

    if (to) {
      conditions.push("rate_date <= ?");
      params.push(to);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `SELECT * FROM silver_rates ${where} ORDER BY rate_date DESC LIMIT ?`,
      [...params, rowLimit(limit, 30)]
    );
    return rows;
  },
};

module.exports = SilverRateModel;
