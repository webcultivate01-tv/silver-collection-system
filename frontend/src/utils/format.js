// Small display helpers shared across the admin panel and the employee portal.

// The API returns DATE columns as "YYYY-MM-DD". `new Date()` would read those
// as UTC midnight and show the wrong day west of Greenwich, so parse them as
// a local calendar day instead.
export function toLocalDate(value) {
  if (value instanceof Date) return value;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  return new Date(value);
}

export function formatDate(value) {
  if (!value) return "—";
  return toLocalDate(value).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRupees(value, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// "2001-04-19" -> 24
export function ageFromDateOfBirth(dateOfBirth) {
  if (!dateOfBirth) return "";
  const dob = toLocalDate(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return "";

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : "";
}

// <input type="date"> needs "YYYY-MM-DD".
export function toDateInputValue(value) {
  if (!value) return "";
  const date = toLocalDate(value);
  if (Number.isNaN(date.getTime())) return "";

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function initialsOf(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  const letters = parts.slice(0, 2).map((part) => part[0]);
  return letters.join("").toUpperCase() || "?";
}

export function formatAadhaar(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 12) return value || "—";
  return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}`;
}

// "2026-08-20" -> "20 Aug" - the short form the charts put under an axis.
export function formatDayShort(value) {
  if (!value) return "";
  return toLocalDate(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// The local calendar day of a value as "YYYY-MM-DD", for grouping rows by date.
export function dayKeyOf(value) {
  return toDateInputValue(value);
}

// "just now" / "3h ago" / "12 Aug 2026" - for an activity feed, where how
// fresh a row is matters more than its exact timestamp.
export function formatRelativeTime(value) {
  if (!value) return "—";

  // toLocalDate, not `new Date`: a "YYYY-MM-DD" column read as UTC midnight
  // would come out a day short east of Greenwich.
  const then = toLocalDate(value);
  if (Number.isNaN(then.getTime())) return "—";

  const seconds = Math.round((Date.now() - then.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(then);
}
