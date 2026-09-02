// Today's silver rate: the admin publishes two per-gram figures - the buying
// rate and the selling rate - and everyone else reads them.

const SilverRateModel = require("../models/silverRateModel");
const { roundRupees } = require("../utils/silverMath");
const { parseDate, parseLimit, parseSearch } = require("../utils/requestParams");

// A year and a day of rates. The ceiling on a date-filtered history: enough
// for any range an admin picks from the two date boxes, still bounded so a
// hand-written query string cannot ask for the whole table at once.
const MAX_HISTORY_ROWS = 366;

// A per-gram rate above this is a typo, not a rate.
const MAX_RATE_PER_GRAM = 100000;
// ...and so is one below this. The ceiling was guarded from the start and the
// floor was not, so a decimal slip - 1.05 typed for 105.00 - was accepted in
// silence, and every purchase that day bought a hundred times too much silver.
// Those weights are frozen into their rows by design, so correcting the rate
// afterwards does not correct the purchases already made at it.
//
// The default is deliberately well below any realistic silver price (a gram
// has been in the ₹70-130 range for years) while still catching a misplaced
// decimal point. It is configurable because the floor is a business judgement,
// not a fact about the code.
//
// A hard floor cannot catch every typo - 205 for 105 sits inside any sensible
// range. The stronger guard is refusing a rate that differs from the previous
// published one by more than some percentage unless the admin confirms it;
// that needs a product decision about the band, so it is left as a follow-up.
const MIN_RATE_PER_GRAM = Number(process.env.MIN_RATE_PER_GRAM) || 10;

function toRate(row) {
  if (!row) return null;

  return {
    id: row.id,
    rateDate: row.rate_date,
    buyRatePerGram: Number(row.buy_rate_per_gram),
    sellRatePerGram: Number(row.sell_rate_per_gram),
    updatedAt: row.updated_at,
  };
}

// How much each side moved since the previous published day.
function changeBetween(current, prior) {
  if (!current || !prior) return null;

  return {
    buy: roundRupees(current.buyRatePerGram - prior.buyRatePerGram),
    sell: roundRupees(current.sellRatePerGram - prior.sellRatePerGram),
  };
}

// Returns { value } or { error } - the caller decides what to do with it.
function parseRate(raw, label) {
  const value = Number(raw);

  if (!Number.isFinite(value) || value <= 0) {
    return { error: `Enter a valid ${label} per gram` };
  }

  if (value > MAX_RATE_PER_GRAM) {
    return { error: `The ${label} per gram looks too large - please check it` };
  }

  if (value < MIN_RATE_PER_GRAM) {
    return { error: `The ${label} per gram looks too small - please check it` };
  }

  return { value };
}

function todayAsDate() {
  // Local date (not UTC) so "today" matches the admin's calendar day.
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

// @route GET /api/silver-rate/today
// Public: the navbar needs it on the login screens too.
async function getTodayRate(req, res) {
  try {
    const { latest, previous } = await SilverRateModel.getLatestPair();

    const current = toRate(latest);
    const prior = toRate(previous);

    res.json({
      rate: current,
      previousRate: prior,
      change: changeBetween(current, prior),
      isToday: !!current && String(current.rateDate).slice(0, 10) === todayAsDate(),
    });
  } catch (error) {
    console.error("getTodayRate failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route GET /api/silver-rate/history?search=10 Aug&from=2026-08-01&to=2026-08-31
//
// `from` and `to` are the admin's date-range filter, and either end stands on
// its own - "everything since 1 August" and "everything up to 31 August" are
// both valid. A range is a deliberate request for that whole span, so it is
// allowed more rows than the unfiltered default: at 30 a filter for a full
// month came back a day short, which reads as missing data rather than as a
// limit.
async function getRateHistory(req, res) {
  try {
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    const ranged = Boolean(from || to);

    const limit = parseLimit(req.query.limit, ranged ? MAX_HISTORY_ROWS : 30, MAX_HISTORY_ROWS);
    const search = parseSearch(req.query.search, 60);

    const rows = await SilverRateModel.listRecent({ limit, search, from, to });
    res.json({ rates: rows.map(toRate) });
  } catch (error) {
    console.error("getRateHistory failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route POST /api/silver-rate
// Body: { buyRatePerGram, sellRatePerGram, rateDate? }
async function saveTodayRate(req, res) {
  try {
    const buy = parseRate(req.body.buyRatePerGram, "buying rate");
    if (buy.error) return res.status(400).json({ message: buy.error });

    const sell = parseRate(req.body.sellRatePerGram, "selling rate");
    if (sell.error) return res.status(400).json({ message: sell.error });

    // The whole margin model depends on this ordering: customers buy at the
    // higher rate and sell back at the lower one, and the difference is the
    // shop's income. Inverted - which is one transposition away on a two-field
    // form - every customer can buy and immediately sell back at a profit,
    // repeatedly, and every step of it looks like a legitimate transaction.
    if (sell.value >= buy.value) {
      return res.status(400).json({
        message:
          "The selling rate must be below the buying rate. " +
          "Customers buy at the buying rate and sell back at the selling rate.",
        errors: { sellRatePerGram: "Must be lower than the buying rate" },
      });
    }

    const requestedDate = String(req.body.rateDate || "");
    const today = todayAsDate();

    // getLatestPair() orders by rate_date, so a rate dated in the future becomes
    // "current" and nothing published afterwards can ever displace it. There is
    // no route to delete a rate row, so that state used to be unrecoverable
    // without direct SQL.
    if (requestedDate && requestedDate > today) {
      return res.status(400).json({
        message: "A rate cannot be published for a future date",
        errors: { rateDate: "Pick today or an earlier date" },
      });
    }

    const rateDate = requestedDate.match(/^\d{4}-\d{2}-\d{2}$/) ? requestedDate : today;

    await SilverRateModel.upsertForDate({
      rateDate,
      buyRatePerGram: roundRupees(buy.value),
      sellRatePerGram: roundRupees(sell.value),
      updatedBy: req.user.id,
    });

    const { latest, previous } = await SilverRateModel.getLatestPair();

    const current = toRate(latest);
    const prior = toRate(previous);

    res.json({
      message: "Silver rate saved",
      rate: current,
      previousRate: prior,
      change: changeBetween(current, prior),
    });
  } catch (error) {
    console.error("saveTodayRate failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

module.exports = {
  getTodayRate,
  getRateHistory,
  saveTodayRate,
  toRate,
  changeBetween,
  todayAsDate,
};
