// Employee Collections: the admin's view of what one employee has collected
// at the counter, and from which client.
//
// Nothing here is a new ledger. Every figure is the same `silver_purchases`
// rows the employee recorded, read from the employee's side instead of the
// customer's and rolled up three ways:
//
//   totals   -> what this employee has taken in over the chosen period
//   clients  -> the same rows, one line per client they collected from
//   rows     -> every individual payment, with the handover it went into
//
// All three run off one WHERE (see collectionWhere in the purchase model), so
// the tables always add up to the totals sitting above them.
//
// Read-only: the panel guard in the router and the sub-admin write block in
// server.js both keep it that way.

const EmployeeModel = require("../models/employeeModel");
const SilverPurchaseModel = require("../models/silverPurchaseModel");
const { roundGrams, roundRupees, formatGrams } = require("../utils/silverMath");
const { parseLimit } = require("../utils/requestParams");

const MAX_ROWS = 500;

// Only "YYYY-MM-DD" reaches the query; anything else is dropped rather than
// passed through as a filter nobody typed.
function asDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
}

function readFilters(query) {
  return {
    from: asDate(query.from),
    to: asDate(query.to),
    status: ["pending", "success"].includes(query.status) ? query.status : "all",
    search: String(query.search || "").trim().slice(0, 80),
    limit: parseLimit(query.limit, MAX_ROWS, MAX_ROWS),
  };
}

// The employee card at the top of the screen - who collected this, not their
// full personnel record.
function toEmployeeCard(employee) {
  return {
    id: employee.id,
    employeeCode: employee.employee_code,
    fullName: employee.full_name,
    email: employee.email,
    mobile: employee.mobile,
    profilePhoto: employee.profile_photo,
    isBlocked: !!employee.is_blocked,
  };
}

const EMPTY_SUMMARY = {
  collections: 0,
  clients: 0,
  totalAmount: 0,
  totalGrams: 0,
  pendingAmount: 0,
  lastOn: null,
};

function toSummary(totals) {
  const summary = {
    ...totals,
    totalAmount: roundRupees(totals.totalAmount),
    totalGrams: roundGrams(totals.totalGrams),
    gramsLabel: formatGrams(totals.totalGrams),
    pendingAmount: roundRupees(totals.pendingAmount),
  };

  // Only the detail totals split out what has already been settled. The
  // picker's per-employee roll-up doesn't, so leave the field off rather than
  // reporting a zero nobody measured.
  if (totals.settledAmount !== undefined) {
    summary.settledAmount = roundRupees(totals.settledAmount);
  }

  return summary;
}

// One payment: the client it came from, and the handover it was bundled into.
// `settlement` is null until the employee has handed that cash over.
function toCollection(row) {
  return {
    id: row.id,
    purchasedOn: row.purchased_on,
    createdAt: row.created_at,
    clientId: row.user_id,
    clientName: row.customer_name,
    clientEmail: row.customer_email,
    clientMobile: row.customer_mobile || null,
    clientImage: row.customer_image || null,
    // Whether this client is one the employee registered themselves, or
    // somebody else's walking up to their counter.
    ownClient: Number(row.created_by_employee_id) === Number(row.employee_id),
    amountPaid: Number(row.amount_paid),
    ratePerGram: Number(row.rate_per_gram),
    grams: roundGrams(row.grams),
    gramsLabel: formatGrams(row.grams),
    paymentStatus: row.payment_status || "pending",
    settlement: row.settlement_id
      ? {
          id: row.settlement_id,
          date: row.settlement_date,
          status: row.settlement_status,
          acceptedAt: row.accepted_at,
        }
      : null,
  };
}

function toClientRow(row) {
  return {
    clientId: row.user_id,
    name: row.name,
    email: row.email,
    mobile: row.mobile || null,
    image: row.profile_image || null,
    collections: Number(row.collections) || 0,
    totalAmount: roundRupees(row.total_amount),
    totalGrams: roundGrams(row.total_grams),
    gramsLabel: formatGrams(row.total_grams),
    pendingAmount: roundRupees(row.pending_amount),
    pendingCount: Number(row.pending_count) || 0,
    firstOn: row.first_on,
    lastOn: row.last_on,
  };
}

// @route GET /api/collections/employees?search=&status=
// The picker. Every employee, each carrying their running collection total so
// the admin can choose from the numbers rather than from a bare name list.
async function listCollectionEmployees(req, res) {
  try {
    const search = String(req.query.search || "").trim().slice(0, 80);
    const status = ["all", "active", "blocked"].includes(req.query.status) ? req.query.status : "all";

    const [employees, summaries] = await Promise.all([
      EmployeeModel.findAll({ search, status }),
      SilverPurchaseModel.collectionSummaryByEmployee(),
    ]);

    const rows = employees.map((employee) => ({
      ...toEmployeeCard(employee),
      summary: toSummary(summaries.get(Number(employee.id)) || EMPTY_SUMMARY),
    }));

    // Busiest collector first; employees who have collected nothing sit at the
    // bottom in name order rather than disappearing - the admin still needs to
    // be able to open one and see an empty screen.
    rows.sort((a, b) => {
      if (b.summary.totalAmount !== a.summary.totalAmount) {
        return b.summary.totalAmount - a.summary.totalAmount;
      }
      return a.fullName.localeCompare(b.fullName);
    });

    res.json({ employees: rows, filters: { search, status }, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("listCollectionEmployees failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route GET /api/collections/employees/:id?from=&to=&status=&search=&limit=
async function getEmployeeCollections(req, res) {
  try {
    const id = Number(req.params.id);
    const employee = Number.isInteger(id) ? await EmployeeModel.findById(id) : null;

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const filters = readFilters(req.query);

    const [totals, clients, rows] = await Promise.all([
      SilverPurchaseModel.collectionTotalsForEmployee(employee.id, filters),
      SilverPurchaseModel.collectionsByClientForEmployee(employee.id, filters),
      SilverPurchaseModel.listCollectionsForEmployee(employee.id, filters),
    ]);

    res.json({
      employee: toEmployeeCard(employee),
      summary: toSummary(totals),
      clients: clients.map(toClientRow),
      collections: rows.map(toCollection),
      filters,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("getEmployeeCollections failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// ---------------------------------------------------------------------------
// The employee's own side: "Monthly Collection".
//
// Same rows, same rounding, read by the employee for themselves - so every
// query below is pinned to req.employee.id and can never be asked about
// somebody else's counter. The admin screens above stay untouched.
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// "YYYY-MM" only; anything else is treated as "no month asked for".
function asMonth(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || "")) ? String(value) : "";
}

// A month key turned into the [from, to] the collection filters already take,
// so a month view is just the same date-range query the admin screen runs.
function monthRange(month) {
  const [year, index] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function monthLabel(month) {
  const [year, index] = month.split("-").map(Number);
  return `${MONTH_NAMES[index - 1]} ${year}`;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function toMonthRow(row) {
  const month = String(row.month);

  return {
    month,
    label: monthLabel(month),
    year: Number(month.slice(0, 4)),
    collections: Number(row.collections) || 0,
    clients: Number(row.clients) || 0,
    totalAmount: roundRupees(row.total_amount),
    totalGrams: roundGrams(row.total_grams),
    gramsLabel: formatGrams(row.total_grams),
    pendingAmount: roundRupees(row.pending_amount),
    pendingCount: Number(row.pending_count) || 0,
    settledAmount: roundRupees(row.settled_amount),
    firstOn: row.first_on || null,
    lastOn: row.last_on || null,
  };
}

// An empty month, so a year always renders as twelve rows rather than only
// the months that happened to have a payment in them.
function emptyMonth(month) {
  return {
    month,
    label: monthLabel(month),
    year: Number(month.slice(0, 4)),
    collections: 0,
    clients: 0,
    totalAmount: 0,
    totalGrams: 0,
    gramsLabel: formatGrams(0),
    pendingAmount: 0,
    pendingCount: 0,
    settledAmount: 0,
    firstOn: null,
    lastOn: null,
  };
}

// The twelve months of a year, newest first, with whatever was collected in
// each dropped into place. Months still in the future are left out - a year
// in progress shows up to the current month and no further.
function monthsOfYear(year, rows) {
  const byMonth = new Map(rows.map((row) => [row.month, row]));
  const now = new Date();
  const lastIndex = year === now.getFullYear() ? now.getMonth() + 1 : 12;

  const months = [];
  for (let index = lastIndex; index >= 1; index -= 1) {
    const month = `${year}-${String(index).padStart(2, "0")}`;
    months.push(byMonth.get(month) || emptyMonth(month));
  }
  return months;
}

// @route GET /api/collections/me
// The figure behind the employee dashboard's "Total collected" card: what
// they have taken in all-time, with this month called out beside it.
async function getMyCollectionTotals(req, res) {
  try {
    const employeeId = req.employee.id;
    const month = currentMonth();

    const [allTime, thisMonth] = await Promise.all([
      SilverPurchaseModel.collectionTotalsForEmployee(employeeId, {}),
      SilverPurchaseModel.collectionTotalsForEmployee(employeeId, monthRange(month)),
    ]);

    res.json({
      summary: toSummary(allTime),
      thisMonth: { month, label: monthLabel(month), ...toSummary(thisMonth) },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("getMyCollectionTotals failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route GET /api/collections/me/monthly?year=
// The Monthly Collection screen: one year at a time, month by month, plus the
// years that have anything in them so the picker only offers real choices.
async function getMyMonthlyCollections(req, res) {
  try {
    const employeeId = req.employee.id;

    const [rows, years, allTime] = await Promise.all([
      SilverPurchaseModel.monthlyCollectionsForEmployee(employeeId, {}),
      SilverPurchaseModel.collectionYearsForEmployee(employeeId),
      SilverPurchaseModel.collectionTotalsForEmployee(employeeId, {}),
    ]);

    const thisYear = new Date().getFullYear();

    // Default to the current year, unless they have never collected in it - in
    // which case open on their most recent one rather than an empty screen.
    const available = years.length ? years : [thisYear];
    const asked = Number(req.query.year);
    const year = available.includes(asked)
      ? asked
      : available.includes(thisYear)
        ? thisYear
        : available[0];

    const ofYear = rows.map(toMonthRow).filter((row) => row.year === year);

    // The year's headline figures come from the same totals query the admin
    // screen uses rather than a sum of the rows below - a client who paid in
    // two months is one client, not two, and only the query knows that.
    const yearTotals = await SilverPurchaseModel.collectionTotalsForEmployee(employeeId, {
      from: `${year}-01-01`,
      to: `${year}-12-31`,
    });

    res.json({
      year,
      years: available,
      months: monthsOfYear(year, ofYear),
      // The strongest month of the year, called out above the table.
      bestMonth: ofYear.reduce(
        (best, row) => (!best || row.totalAmount > best.totalAmount ? row : best),
        null
      ),
      summary: toSummary(yearTotals),
      allTime: toSummary(allTime),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("getMyMonthlyCollections failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route GET /api/collections/me/months/:month
// Every payment inside one month, for when the employee opens a row on the
// Monthly Collection screen and asks "which clients was that?".
async function getMyMonthCollections(req, res) {
  try {
    const month = asMonth(req.params.month);

    if (!month) {
      return res.status(400).json({ message: "Pick a month in YYYY-MM form" });
    }

    const employeeId = req.employee.id;
    const filters = { ...monthRange(month), status: "all", search: "", limit: MAX_ROWS };

    const [totals, clients, rows] = await Promise.all([
      SilverPurchaseModel.collectionTotalsForEmployee(employeeId, filters),
      SilverPurchaseModel.collectionsByClientForEmployee(employeeId, filters),
      SilverPurchaseModel.listCollectionsForEmployee(employeeId, filters),
    ]);

    res.json({
      month,
      label: monthLabel(month),
      summary: toSummary(totals),
      clients: clients.map(toClientRow),
      collections: rows.map(toCollection),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("getMyMonthCollections failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

module.exports = {
  listCollectionEmployees,
  getEmployeeCollections,
  getMyCollectionTotals,
  getMyMonthlyCollections,
  getMyMonthCollections,
};

