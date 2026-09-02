// Admin view of every registered employee, with search and a status filter.
// Each row can be opened, blocked/unblocked or deleted from here.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  deleteEmployee,
  fetchEmployees,
  toggleEmployeeBlock,
} from "../../store/employeesSlice.js";
import ConfirmModal from "../../components/ConfirmModal.jsx";
import { documentUrl } from "../../components/DocumentUpload.jsx";
import { initialsOf } from "../../utils/format.js";
import {
  IconBlock,
  IconCheck,
  IconEye,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUsers,
} from "../../components/Icons.jsx";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "blocked", label: "Blocked" },
];

function StatCard({ label, value, tone }) {
  return (
    <div className="card px-5 py-4">
      <div className="text-sm text-silver-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function Avatar({ employee }) {
  if (employee.profile_photo) {
    return (
      <img
        src={documentUrl(employee.profile_photo)}
        alt={employee.full_name}
        className="h-10 w-10 shrink-0 rounded-full border border-silver-200 object-cover"
      />
    );
  }

  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
      {initialsOf(employee.full_name)}
    </span>
  );
}

export default function EmployeeList() {
  const dispatch = useDispatch();
  const { list, counts, loading, saving, error } = useSelector((state) => state.employees);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  // { action: "block" | "unblock" | "delete", employee }
  const [confirm, setConfirm] = useState(null);
  const [notice, setNotice] = useState("");

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => dispatch(fetchEmployees({ search, status })), 300);
    return () => clearTimeout(timer);
  }, [dispatch, search, status]);

  async function handleConfirm() {
    const { action, employee } = confirm;

    const result =
      action === "delete"
        ? await dispatch(deleteEmployee(employee.id))
        : await dispatch(toggleEmployeeBlock({ id: employee.id, blocked: action === "block" }));

    if (!result.error) {
      setNotice(
        action === "delete"
          ? `${employee.full_name} has been deleted.`
          : action === "block"
            ? `${employee.full_name} has been blocked.`
            : `${employee.full_name} has been unblocked.`
      );
    }
    setConfirm(null);
  }

  const confirmProps = !confirm
    ? {}
    : {
        block: {
          title: "Block this employee?",
          message: `${confirm.employee.full_name} won't be able to log in until you unblock them.`,
          confirmLabel: "Block employee",
          confirmVariant: "btn-danger",
        },
        unblock: {
          title: "Unblock this employee?",
          message: `${confirm.employee.full_name} will be able to log in again with their existing password.`,
          confirmLabel: "Unblock employee",
          confirmVariant: "btn-primary",
        },
        delete: {
          title: "Delete this employee?",
          message: `${confirm.employee.full_name}'s record and every uploaded document will be permanently removed from the server. This cannot be undone.`,
          confirmLabel: "Delete permanently",
          confirmVariant: "btn-danger",
        },
      }[confirm.action];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-silver-900">Employees</h1>
          <p className="mt-1 text-sm text-silver-500">
            Register team members, reset their passwords and control their access.
          </p>
        </div>
        <Link to="/dashboard/employees/new" className="btn-primary">
          <IconPlus className="w-4 h-4" />
          Register Employee
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total employees" value={counts.total} tone="text-silver-900" />
        <StatCard label="Active" value={counts.active} tone="text-emerald-600" />
        <StatCard label="Blocked" value={counts.blocked} tone="text-red-600" />
      </div>

      {notice && <div className="alert-success">{notice}</div>}
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
        </div>

        {loading && list.length === 0 ? (
          <div className="py-16 text-center text-sm text-silver-500">Loading employees...</div>
        ) : list.length === 0 ? (
          <div className="py-16 text-center">
            <span className="mx-auto grid place-items-center w-12 h-12 rounded-full bg-silver-100 text-silver-400">
              <IconUsers className="w-6 h-6" />
            </span>
            <p className="mt-3 text-sm font-medium text-silver-900">No employees found</p>
            <p className="mt-1 text-sm text-silver-500">
              {search || status !== "all"
                ? "Try a different search or filter."
                : "Register your first employee to get started."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-silver-50 border-b border-silver-200">
                <tr>
                  <th className="table-head">Photo</th>
                  <th className="table-head">First Name</th>
                  <th className="table-head">Last Name</th>
                  <th className="table-head">Mobile Number</th>
                  <th className="table-head">Email</th>
                  <th className="table-head">Status</th>
                  <th className="table-head text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-silver-200">
                {list.map((employee) => (
                  <tr key={employee.id} className="hover:bg-silver-50/70 transition-colors">
                    <td className="table-cell">
                      <Avatar employee={employee} />
                    </td>
                    <td className="table-cell font-medium text-silver-900">
                      {employee.first_name}
                      <div className="text-xs font-normal text-silver-400 tabular-nums">
                        {employee.employee_code}
                      </div>
                    </td>
                    <td className="table-cell font-medium text-silver-900">{employee.last_name}</td>
                    <td className="table-cell tabular-nums">+91 {employee.mobile}</td>
                    <td className="table-cell">{employee.email}</td>
                    <td className="table-cell">
                      {employee.is_blocked ? (
                        <span className="badge-danger">Blocked</span>
                      ) : employee.must_change_password ? (
                        <span className="badge-warning">Pending setup</span>
                      ) : (
                        <span className="badge-success">Active</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/dashboard/employees/${employee.id}`}
                          className="btn-secondary btn-sm"
                          title="View this employee"
                        >
                          <IconEye className="w-3.5 h-3.5" />
                          View
                        </Link>

                        <button
                          disabled={saving}
                          onClick={() =>
                            setConfirm({
                              action: employee.is_blocked ? "unblock" : "block",
                              employee,
                            })
                          }
                          className={`btn-sm ${employee.is_blocked ? "btn-primary" : "btn-secondary"}`}
                          title={employee.is_blocked ? "Unblock this employee" : "Block this employee"}
                        >
                          {employee.is_blocked ? (
                            <IconCheck className="w-3.5 h-3.5" />
                          ) : (
                            <IconBlock className="w-3.5 h-3.5" />
                          )}
                          {employee.is_blocked ? "Unblock" : "Block"}
                        </button>

                        <button
                          disabled={saving}
                          onClick={() => setConfirm({ action: "delete", employee })}
                          className="btn-danger btn-sm"
                          title="Delete this employee"
                        >
                          <IconTrash className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!confirm}
        loading={saving}
        onCancel={() => setConfirm(null)}
        onConfirm={handleConfirm}
        {...confirmProps}
      />
    </div>
  );
}
