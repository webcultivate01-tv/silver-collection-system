// Read-only reporting data, shared by the main admin and sub-admins.
//
// This is the ONLY data surface a sub-admin has. Every route here is a GET
// that reads and returns rows - nothing in this file writes anything, so a
// sub-admin cannot change data even if they call the API directly.

const EmployeeModel = require("../models/employeeModel");
const SilverRateModel = require("../models/silverRateModel");
const { toRate, changeBetween } = require("./silverRateController");
const { parseLimit } = require("../utils/requestParams");

const MAX_ROWS = 500;

// A date filter is only honoured in the form the <input type="date"> sends.
function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

// Aadhaar is sensitive, so reports only ever show the last 4 digits.
function maskAadhaar(aadhaar) {
  return `XXXX XXXX ${String(aadhaar).slice(-4)}`;
}

function statusOf(employee) {
  if (employee.is_blocked) return "Blocked";
  if (employee.must_change_password) return "Pending setup";
  return "Active";
}

// The columns a report needs - no document paths, no password fields.
function toEmployeeRow(employee) {
  return {
    id: employee.id,
    employeeCode: employee.employee_code,
    firstName: employee.first_name,
    lastName: employee.last_name,
    fullName: employee.full_name,
    mobile: employee.mobile,
    email: employee.email,
    age: employee.age,
    dateOfBirth: employee.date_of_birth,
    aadhaarNumber: maskAadhaar(employee.aadhaar_number),
    address: employee.address,
    status: statusOf(employee),
    isBlocked: !!employee.is_blocked,
    registeredOn: employee.created_at,
  };
}

// @route GET /api/reports/summary
// The headline figures on the sub-admin dashboard.
async function getSummary(req, res) {
  try {
    const counts = await EmployeeModel.countByStatus();
    const { latest, previous } = await SilverRateModel.getLatestPair();

    const rate = toRate(latest);
    const prior = toRate(previous);

    res.json({
      employees: counts,
      rate,
      previousRate: prior,
      change: changeBetween(rate, prior),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("getSummary failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route GET /api/reports/employees?search=&status=
async function getEmployeeReport(req, res) {
  try {
    const search = String(req.query.search || "").trim().slice(0, 80);
    const status = ["all", "active", "blocked"].includes(req.query.status) ? req.query.status : "all";

    const employees = await EmployeeModel.findAll({ search, status });
    const counts = await EmployeeModel.countByStatus();

    res.json({
      employees: employees.map(toEmployeeRow),
      counts,
      filters: { search, status },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("getEmployeeReport failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route GET /api/reports/silver-rates?search=&from=&to=&limit=
async function getSilverRateReport(req, res) {
  try {
    const search = String(req.query.search || "").trim().slice(0, 60);
    const limit = parseLimit(req.query.limit, 100, MAX_ROWS);
    const from = isDate(req.query.from) ? req.query.from : "";
    const to = isDate(req.query.to) ? req.query.to : "";

    const rows = await SilverRateModel.listRecent({ limit, search, from, to });

    res.json({
      rates: rows.map(toRate),
      filters: { search, from, to, limit },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("getSilverRateReport failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

module.exports = { getSummary, getEmployeeReport, getSilverRateReport };
