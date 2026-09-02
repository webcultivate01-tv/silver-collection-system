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

// A date filter, honoured only in the form <input type="date"> sends.
function parseDate(raw) {
  return DATE_PATTERN.test(String(raw || "")) ? String(raw) : "";
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

module.exports = { parseLimit, parseDate, parseSearch, parseEnum, parseId, DATE_PATTERN };
