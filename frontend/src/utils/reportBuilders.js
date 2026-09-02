// Report definitions, in one place so the dashboard's quick-download buttons
// and the full report pages always produce an identical file.
//
// Each builder returns the shape ReportDownloadButtons / reportDownload.js
// expect: { fileName, title, columns, rows, meta }.

import { formatAadhaar, formatDate, formatDateTime, formatRupees } from "./format.js";

const STATUS_LABELS = {
  all: "All employees",
  active: "Active only",
  blocked: "Blocked only",
};

function generatedNow() {
  return formatDateTime(new Date());
}

export function buildEmployeeReport(employees, { status = "all", search = "" } = {}) {
  return {
    fileName: "employee-report",
    title: "Employee Report",
    columns: [
      { key: "employeeCode", label: "Employee ID" },
      { key: "firstName", label: "First Name" },
      { key: "lastName", label: "Last Name" },
      { key: "mobile", label: "Mobile" },
      { key: "email", label: "Email" },
      { key: "age", label: "Age", align: "right" },
      { key: "dateOfBirth", label: "Date of Birth" },
      { key: "aadhaarNumber", label: "Aadhaar" },
      { key: "address", label: "Address" },
      { key: "status", label: "Status" },
      { key: "registeredOn", label: "Registered On" },
    ],
    rows: employees.map((employee) => ({
      employeeCode: employee.employeeCode || "—",
      firstName: employee.firstName,
      lastName: employee.lastName,
      mobile: employee.mobile ? `+91 ${employee.mobile}` : "—",
      email: employee.email,
      age: employee.age,
      dateOfBirth: formatDate(employee.dateOfBirth),
      // Already masked by the API; this only spaces the digits out.
      aadhaarNumber: formatAadhaar(employee.aadhaarNumber),
      address: employee.address,
      status: employee.status,
      registeredOn: formatDate(employee.registeredOn),
    })),
    meta: [
      ["Records", String(employees.length)],
      ["Filter", STATUS_LABELS[status] || STATUS_LABELS.all],
      ["Search", search || "—"],
      ["Generated", generatedNow()],
    ],
  };
}

// `search` is the sub-admin's standalone rate page ("find that day's rate");
// `from`/`to` the report card's date range. Only the one that was used is
// stated on the file, so a printed copy never claims a filter nobody set.
export function buildSilverRateReport(rates, { search = "", from = "", to = "" } = {}) {
  return {
    fileName: "silver-rate-report",
    title: "Silver Rate Report",
    // No "last updated" column: a rate row is identified by the day it is for,
    // and showing when the row was last touched only invited the question of
    // which of the two dates the reader should trust.
    columns: [
      { key: "rateDate", label: "Date" },
      { key: "buyRatePerGram", label: "Buying rate per gram (₹)", align: "right" },
      { key: "sellRatePerGram", label: "Selling rate per gram (₹)", align: "right" },
    ],
    rows: rates.map((rate) => ({
      rateDate: formatDate(rate.rateDate),
      buyRatePerGram: formatRupees(rate.buyRatePerGram),
      sellRatePerGram: formatRupees(rate.sellRatePerGram),
    })),
    meta: [
      ["Records", String(rates.length)],
      ...(search ? [["Search", search]] : []),
      ["From", from ? formatDate(from) : "—"],
      ["To", to ? formatDate(to) : "—"],
      ["Generated", generatedNow()],
    ],
  };
}

const USER_STATUS_LABELS = {
  all: "All users",
  active: "Active only",
  inactive: "Inactive only",
};

// Admin-only report: the full user list, straight from the admin's own /users
// API (already unmasked on screen), not the sub-admin's read-only surface.
export function buildUserReport(users, { status = "all", search = "", employeeLabel = "" } = {}) {
  return {
    fileName: "user-report",
    title: "User Report",
    columns: [
      { key: "name", label: "Name" },
      { key: "mobile", label: "Mobile" },
      { key: "email", label: "Email" },
      { key: "age", label: "Age", align: "right" },
      { key: "dateOfBirth", label: "Date of Birth" },
      { key: "aadhaarNumber", label: "Aadhaar" },
      { key: "address", label: "Address" },
      { key: "addedBy", label: "Added By" },
      { key: "status", label: "Status" },
      { key: "registeredOn", label: "Registered On" },
    ],
    rows: users.map((user) => ({
      name: user.name,
      mobile: user.mobile ? `+91 ${user.mobile}` : "—",
      email: user.email,
      age: user.age,
      dateOfBirth: formatDate(user.date_of_birth),
      aadhaarNumber: formatAadhaar(user.aadhaar_number),
      address: user.address,
      addedBy: user.employee_name
        ? `${user.employee_name}${user.employee_code ? ` (${user.employee_code})` : ""}`
        : "—",
      status: user.is_active ? "Active" : "Inactive",
      registeredOn: formatDate(user.created_at),
    })),
    meta: [
      ["Records", String(users.length)],
      ["Filter", USER_STATUS_LABELS[status] || USER_STATUS_LABELS.all],
      ["Search", search || "—"],
      ["Added by", employeeLabel || "All employees"],
      ["Generated", generatedNow()],
    ],
  };
}

const SETTLEMENT_STATUS_LABELS = {
  all: "All handovers",
  pending: "Awaiting admin",
  accepted: "Accepted",
};

// Admin-only report: every employee's cash handover, pending or accepted -
// or, with `employeeLabel`, one employee's own settlement history on its own.
export function buildSettlementReport(
  settlements,
  { status = "all", from = "", to = "", employeeLabel = "" } = {}
) {
  return {
    fileName: "settlement-report",
    title: "Cash Settlement Report",
    columns: [
      { key: "employeeName", label: "Employee" },
      { key: "employeeCode", label: "Employee ID" },
      { key: "settlementDate", label: "Date" },
      { key: "purchaseCount", label: "Purchases", align: "right" },
      { key: "totalAmount", label: "Amount (₹)", align: "right" },
      { key: "status", label: "Status" },
      { key: "acceptedBy", label: "Accepted By" },
      { key: "acceptedOn", label: "Accepted On" },
    ],
    rows: settlements.map((settlement) => ({
      employeeName: settlement.employeeName,
      employeeCode: settlement.employeeCode || "—",
      settlementDate: formatDate(settlement.settlementDate),
      purchaseCount: settlement.purchaseCount,
      totalAmount: formatRupees(settlement.totalAmount),
      status: settlement.status === "accepted" ? "Accepted" : "Awaiting Admin",
      acceptedBy: settlement.acceptedByName || "—",
      acceptedOn: settlement.acceptedAt ? formatDateTime(settlement.acceptedAt) : "—",
    })),
    meta: [
      ["Records", String(settlements.length)],
      ["Filter", SETTLEMENT_STATUS_LABELS[status] || SETTLEMENT_STATUS_LABELS.all],
      ["From", from ? formatDate(from) : "—"],
      ["To", to ? formatDate(to) : "—"],
      ["Employee", employeeLabel || "All employees"],
      ["Generated", generatedNow()],
    ],
  };
}

// Admin-only report: every purchase recorded across every employee, the same
// ledger the settlements are bundled from.
export function buildPurchaseReport(purchases, { search = "", from = "", to = "" } = {}) {
  return {
    fileName: "purchase-report",
    title: "Purchase Report",
    columns: [
      { key: "purchasedOn", label: "Date" },
      { key: "customerName", label: "Customer" },
      { key: "employeeName", label: "Recorded By" },
      { key: "amountPaid", label: "Amount Paid (₹)", align: "right" },
      { key: "ratePerGram", label: "Rate per gram (₹)", align: "right" },
      { key: "grams", label: "Silver", align: "right" },
      { key: "paymentStatus", label: "Payment Status" },
    ],
    rows: purchases.map((purchase) => ({
      purchasedOn: formatDate(purchase.purchasedOn),
      customerName: purchase.customerName,
      employeeName: purchase.employeeName
        ? `${purchase.employeeName}${purchase.employeeCode ? ` (${purchase.employeeCode})` : ""}`
        : "—",
      amountPaid: formatRupees(purchase.amountPaid),
      ratePerGram: formatRupees(purchase.ratePerGram),
      grams: purchase.gramsLabel,
      paymentStatus: purchase.paymentStatus === "success" ? "Success" : "Pending",
    })),
    meta: [
      ["Records", String(purchases.length)],
      ["Search", search || "—"],
      ["From", from ? formatDate(from) : "—"],
      ["To", to ? formatDate(to) : "—"],
      ["Generated", generatedNow()],
    ],
  };
}

// Employee Collections, in the two shapes that screen shows them: every
// individual payment, and the same payments folded up one line per client.
// Both carry the employee in the meta block, so a downloaded file can never
// be mistaken for another employee's.
function collectionMeta(employee, { from, to, status, count, total }) {
  const meta = [
    ["Employee", `${employee.fullName}${employee.employeeCode ? ` (${employee.employeeCode})` : ""}`],
    ["Records", String(count)],
    ["From", from ? formatDate(from) : "—"],
    ["To", to ? formatDate(to) : "—"],
    ["Payment status", COLLECTION_STATUS_LABELS[status] || COLLECTION_STATUS_LABELS.all],
  ];

  // The period's total, when the screen knows it. It is the summary figure, so
  // it still states the truth on a download whose rows were capped.
  if (total !== undefined && total !== null) {
    meta.push(["Total collected", `₹${formatRupees(total)}`]);
  }

  meta.push(["Generated", generatedNow()]);
  return meta;
}

const COLLECTION_STATUS_LABELS = {
  all: "All collections",
  pending: "Pending handover only",
  success: "Settled only",
};

export function buildEmployeeCollectionReport(
  collections,
  employee,
  { from = "", to = "", status = "all", total } = {}
) {
  return {
    fileName: `collections-${employee.employeeCode || employee.id}`,
    title: `Collections — ${employee.fullName}`,
    columns: [
      { key: "purchasedOn", label: "Date" },
      { key: "clientName", label: "Client" },
      { key: "clientMobile", label: "Mobile" },
      { key: "clientEmail", label: "Email" },
      { key: "amountPaid", label: "Collected (₹)", align: "right" },
      { key: "ratePerGram", label: "Rate per gram (₹)", align: "right" },
      { key: "grams", label: "Silver", align: "right" },
      { key: "paymentStatus", label: "Payment Status" },
      { key: "handover", label: "Handover" },
    ],
    rows: collections.map((row) => ({
      purchasedOn: formatDate(row.purchasedOn),
      clientName: row.clientName,
      clientMobile: row.clientMobile ? `+91 ${row.clientMobile}` : "—",
      clientEmail: row.clientEmail,
      amountPaid: formatRupees(row.amountPaid),
      ratePerGram: formatRupees(row.ratePerGram),
      grams: row.gramsLabel,
      paymentStatus: row.paymentStatus === "success" ? "Success" : "Pending",
      handover: row.settlement
        ? `#${row.settlement.id} · ${formatDate(row.settlement.date)} · ${
            row.settlement.status === "accepted" ? "Accepted" : "Awaiting admin"
          }`
        : "Not handed over",
    })),
    meta: collectionMeta(employee, { from, to, status, count: collections.length, total }),
  };
}

// The employee's own Monthly Collection screen: one line per month of the
// year on show, so they can hand the admin the same figures they are reading.
export function buildMonthlyCollectionReport(months, employee, { year }) {
  return {
    fileName: `monthly-collections-${year}`,
    title: `Monthly Collections ${year}`,
    columns: [
      { key: "month", label: "Month" },
      { key: "collections", label: "Collections", align: "right" },
      { key: "clients", label: "Clients", align: "right" },
      { key: "totalAmount", label: "Collected (₹)", align: "right" },
      { key: "grams", label: "Silver", align: "right" },
      { key: "pendingAmount", label: "Not handed over (₹)", align: "right" },
      { key: "lastOn", label: "Last collection" },
    ],
    rows: months.map((row) => ({
      month: row.label,
      collections: String(row.collections),
      clients: String(row.clients),
      totalAmount: formatRupees(row.totalAmount),
      grams: row.collections ? row.gramsLabel : "—",
      pendingAmount: formatRupees(row.pendingAmount),
      lastOn: row.lastOn ? formatDate(row.lastOn) : "—",
    })),
    meta: [
      [
        "Employee",
        `${employee?.fullName || "—"}${employee?.employeeCode ? ` (${employee.employeeCode})` : ""}`,
      ],
      ["Year", String(year)],
      ["Months", String(months.length)],
      ["Generated", generatedNow()],
    ],
  };
}

export function buildCollectionClientReport(
  clients,
  employee,
  { from = "", to = "", status = "all", total } = {}
) {
  return {
    fileName: `collections-by-client-${employee.employeeCode || employee.id}`,
    title: `Collections by client — ${employee.fullName}`,
    columns: [
      { key: "name", label: "Client" },
      { key: "mobile", label: "Mobile" },
      { key: "email", label: "Email" },
      { key: "collections", label: "Collections", align: "right" },
      { key: "totalAmount", label: "Collected (₹)", align: "right" },
      { key: "grams", label: "Silver", align: "right" },
      { key: "firstOn", label: "First" },
      { key: "lastOn", label: "Latest" },
    ],
    rows: clients.map((client) => ({
      name: client.name,
      mobile: client.mobile ? `+91 ${client.mobile}` : "—",
      email: client.email,
      collections: String(client.collections),
      totalAmount: formatRupees(client.totalAmount),
      grams: client.gramsLabel,
      firstOn: formatDate(client.firstOn),
      lastOn: formatDate(client.lastOn),
    })),
    meta: collectionMeta(employee, { from, to, status, count: clients.length, total }),
  };
}
