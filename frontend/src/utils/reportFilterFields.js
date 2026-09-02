// Filter field definitions for the report download centre - shared by the
// admin and sub-admin Reports pages so a filter always means the same thing,
// and matches the same query params the backend already accepts (see
// reportController.js, adminUserController.js, settlementController.js and
// purchaseController.js).
//
// Each entry is { defaults, fields }: `defaults` is also "no filter applied",
// used both as the initial fetch and to detect whether a "Clear filters"
// link should show.
//
// `suggestions` is the list a "suggest" box offers under the cursor -
// { value, label, hint } rows built from what the card has already fetched
// (see useReportCenter.js). A "from"/"to" pair is a date range: the runner in
// ReportFilters.jsx keeps them on one line and stops the range running
// backwards.

export function employeeReportFilters(suggestions = []) {
  return {
    defaults: { search: "", status: "all" },
    fields: [
      {
        key: "search",
        type: "suggest",
        label: "Search",
        placeholder: "Name, email, mobile or ID",
        options: suggestions,
      },
      {
        key: "status",
        type: "select",
        label: "Status",
        options: [
          { value: "all", label: "All" },
          { value: "active", label: "Active" },
          { value: "blocked", label: "Blocked" },
        ],
      },
    ],
  };
}

// Rates are filed one row per day, so a date range is the whole filter: the
// old "type the date" box said the same thing less exactly.
export const SILVER_RATE_REPORT_FILTERS = {
  defaults: { from: "", to: "" },
  fields: [
    { key: "from", type: "date", label: "From" },
    { key: "to", type: "date", label: "To" },
  ],
};

// `employeeOptions` is built at render time from the "Added by" list the
// /users API already returns, so it stays in sync with fetchUsers.
export function userReportFilters(employeeOptions = [], suggestions = []) {
  return {
    defaults: { search: "", status: "all", employeeId: "" },
    fields: [
      {
        key: "search",
        type: "suggest",
        label: "Search",
        placeholder: "Name, email or mobile",
        options: suggestions,
      },
      {
        key: "status",
        type: "select",
        label: "Status",
        options: [
          { value: "all", label: "All" },
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ],
      },
      {
        key: "employeeId",
        type: "select",
        label: "Added by",
        options: [
          { value: "", label: "All employees" },
          ...employeeOptions.map((employee) => ({
            value: String(employee.id),
            label: `${employee.fullName} (${employee.users})`,
          })),
        ],
      },
    ],
  };
}

// `employeeOptions` is the same "Added by" list the /users API returns -
// every employee, so the admin can pull one employee's whole settlement
// history on its own, over whatever period they choose.
export function settlementReportFilters(employeeOptions = []) {
  return {
    defaults: { status: "all", from: "", to: "", employeeId: "" },
    fields: [
      {
        key: "status",
        type: "select",
        label: "Status",
        options: [
          { value: "all", label: "All" },
          { value: "pending", label: "Awaiting admin" },
          { value: "accepted", label: "Accepted" },
        ],
      },
      { key: "from", type: "date", label: "From" },
      { key: "to", type: "date", label: "To" },
      {
        key: "employeeId",
        type: "select",
        label: "Employee",
        options: [
          { value: "", label: "All employees" },
          ...employeeOptions.map((employee) => ({
            value: String(employee.id),
            label: employee.employeeCode
              ? `${employee.fullName} (${employee.employeeCode})`
              : employee.fullName,
          })),
        ],
      },
    ],
  };
}

export function purchaseReportFilters(suggestions = []) {
  return {
    defaults: { search: "", from: "", to: "" },
    fields: [
      {
        key: "search",
        type: "suggest",
        label: "Search",
        placeholder: "Customer name or email",
        options: suggestions,
      },
      { key: "from", type: "date", label: "From" },
      { key: "to", type: "date", label: "To" },
    ],
  };
}
