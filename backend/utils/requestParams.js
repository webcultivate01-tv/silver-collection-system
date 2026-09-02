// Reading values off a request safely.
//
// These were written out by hand in each controller, and the hand-written
// version had a gap: `Math.min(Number(req.query.limit) || 50, MAX)` caps the
// top but not the bottom and does not force a whole number, so "?limit=-5"
// and "?limit=1.5" both reached `LIMIT ?` and produced invalid SQL. Having one
// implementation means fixing it once.

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// A row limit that is always a whole number between 1 and `max`.
function parseLimit(raw, fallback, max) {
  const value = Math.trunc(Number(raw));

  if (!Number.isFinite(value) || value <= 0) return Math.min(fallback, max);

  return Math.min(value, max);
}

// The same clamp, applied at the query rather than at the request.
//
// `LIMIT ?` is the one placeholder MySQL will not accept just anything in: a
// negative, a fraction or a numeric string is a parse error, not an empty
// result. Every controller does sanitise the limit it passes - but the SQL is
// what breaks, so the guard belongs beside the SQL too, where a caller added
// later cannot forget it. The ceiling is a backstop against a model being
// asked for the whole table; the controllers cap well below it.
const MAX_ROW_LIMIT = 1000;

function rowLimit(raw, fallback) {
  return parseLimit(raw, fallback, MAX_ROW_LIMIT);
}

// A date filter, honoured only in the form <input type="date"> sends - and
// only if it names a day that actually exists.
//
// The shape check on its own is not enough. "2026-02-30" and "2026-13-45" both
// match the pattern, and MySQL refuses them outright ("Incorrect DATE value"),
// so a shape-only guard turned a hand-typed query string into a 500 on every
// date-filtered screen.
//
// Reading the three parts back off the parsed date is what tells a real day
// from a shaped one, because Date rolls the impossible ones over instead of
// refusing them: February 30th comes back as March 1st, and month 13 as
// January of the next year. If any part changed, the day asked for does not
// exist.
function parseDate(raw) {
  const value = String(raw || "");
  if (!DATE_PATTERN.test(value)) return "";

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  const sameDay =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;

  return sameDay ? value : "";
}

// A search box's contents: trimmed, length-capped, and always a string even if
// the query string supplied an array or an object.
function parseSearch(raw, maxLength = 80) {
  if (raw === undefined || raw === null) return "";
  const value = Array.isArray(raw) ? raw[0] : raw;
  return String(value).trim().slice(0, maxLength);
}

// One of a fixed set of values, or the fallback. Stops an unexpected query
// parameter reaching a query as a filter nobody wrote.
function parseEnum(raw, allowed, fallback = "all") {
  return allowed.includes(raw) ? raw : fallback;
}

// A positive row id, or null. Used for `?employeeId=` style filters.
function parseId(raw) {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

module.exports = {
  parseLimit,
  rowLimit,
  parseDate,
  parseSearch,
  parseEnum,
  parseId,
  DATE_PATTERN,
  MAX_ROW_LIMIT,
};
