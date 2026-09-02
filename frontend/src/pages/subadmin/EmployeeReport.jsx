// Sub-admin employee report: the same search and status filter the admin list
// has, but the rows are plain text - no view/block/delete column, because a
// sub-admin has nothing to act on here.

import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchEmployeeReport } from "../../store/reportsSlice.js";
import { buildEmployeeReport } from "../../utils/reportBuilders.js";
import ReportDownloadButtons from "../../components/ReportDownloadButtons.jsx";
import { formatAadhaar, formatDate } from "../../utils/format.js";
import { IconEye, IconSearch, IconUsers } from "../../components/Icons.jsx";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "blocked", label: "Blocked" },
];

function StatusBadge({ status }) {
  if (status === "Blocked") return <span className="badge-danger">Blocked</span>;
  if (status === "Pending setup") return <span className="badge-warning">Pending setup</span>;
  return <span className="badge-success">Active</span>;
}

function StatCard({ label, value, tone }) {
  return (
    <div className="card px-5 py-4">
      <div className="text-sm text-silver-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

export default function EmployeeReport() {
  const dispatch = useDispatch();
  const { employees, employeeCounts, employeesLoading, error } = useSelector(
    (state) => state.reports
  );

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => dispatch(fetchEmployeeReport({ search, status })), 300);
    return () => clearTimeout(timer);
  }, [dispatch, search, status]);

  // What you download is what the filters above have left on screen.
  const report = buildEmployeeReport(employees, { search, status });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-silver-900">Employee Report</h1>
          <p className="mt-1 text-sm text-silver-500">
            Registered staff, their contact details and account status.
          </p>
        </div>

        <ReportDownloadButtons report={report} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total employees" value={employeeCounts.total} tone="text-silver-900" />
        <StatCard label="Active" value={employeeCounts.active} tone="text-emerald-600" />
        <StatCard label="Blocked" value={employeeCounts.blocked} tone="text-red-600" />
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="card overflow-hidden">
        <div className="card-header flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-silver-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9"
              placeholder="Search by name, email or mobile"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex gap-1 rounded-lg bg-silver-100 p-1 w-fit">
              {FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => setStatus(filter.key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    status === filter.key
                      ? "bg-white text-silver-900 shadow-card"
                      : "text-silver-500 hover:text-silver-800"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <span className="badge-neutral hidden sm:inline-flex">
              <IconEye className="w-3.5 h-3.5" />
              Read-only
            </span>
          </div>
        </div>

        {employeesLoading && employees.length === 0 ? (
          <div className="py-16 text-center text-sm text-silver-500">Loading report...</div>
        ) : employees.length === 0 ? (
          <div className="py-16 text-center">
            <span className="mx-auto grid place-items-center w-12 h-12 rounded-full bg-silver-100 text-silver-400">
              <IconUsers className="w-6 h-6" />
            </span>
            <p className="mt-3 text-sm font-medium text-silver-900">No employees found</p>
            <p className="mt-1 text-sm text-silver-500">
              {search || status !== "all"
                ? "Try a different search or filter."
                : "No employees have been registered yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead className="bg-silver-50 border-b border-silver-200">
                <tr>
                  <th className="table-head">Employee ID</th>
                  <th className="table-head">Name</th>
                  <th className="table-head">Mobile</th>
                  <th className="table-head">Email</th>
                  <th className="table-head">Aadhaar</th>
                  <th className="table-head">Status</th>
                  <th className="table-head">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-silver-200">
                {employees.map((employee) => (
                  <tr key={employee.id} className="hover:bg-silver-50/70 transition-colors">
                    <td className="table-cell tabular-nums text-silver-500">
                      {employee.employeeCode || "—"}
                    </td>
                    <td className="table-cell font-medium text-silver-900">
                      {employee.fullName}
                    </td>
                    <td className="table-cell tabular-nums">+91 {employee.mobile}</td>
                    <td className="table-cell">{employee.email}</td>
                    <td className="table-cell tabular-nums text-silver-500">
                      {formatAadhaar(employee.aadhaarNumber)}
                    </td>
                    <td className="table-cell">
                      <StatusBadge status={employee.status} />
                    </td>
                    <td className="table-cell text-silver-500">
                      {formatDate(employee.registeredOn)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
