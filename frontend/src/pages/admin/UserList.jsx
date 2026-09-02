// Admin view of every user in the system, and which employee added them.
//
// "Added by" narrows the list down to one employee, which is how the admin sees
// a particular employee's users. Registering and editing users belongs to the
// employee who owns them, so this screen only reads.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchUsers } from "../../store/adminUsersSlice.js";
import { documentUrl } from "../../components/DocumentUpload.jsx";
import { formatDate, initialsOf } from "../../utils/format.js";
import { IconEye, IconSearch, IconUsers } from "../../components/Icons.jsx";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Inactive" },
];

function StatCard({ label, value, tone }) {
  return (
    <div className="card px-5 py-4">
      <div className="text-sm text-silver-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function Avatar({ user }) {
  if (user.profile_image) {
    return (
      <img
        src={documentUrl(user.profile_image)}
        alt={user.name}
        className="h-10 w-10 shrink-0 rounded-full border border-silver-200 object-cover"
      />
    );
  }

  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
      {initialsOf(user.name)}
    </span>
  );
}

export default function UserList() {
  const dispatch = useDispatch();
  const { list, counts, employees, loading, error } = useSelector((state) => state.adminUsers);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  // "" means every employee.
  const [employeeId, setEmployeeId] = useState("");

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => dispatch(fetchUsers({ search, status, employeeId })), 300);
    return () => clearTimeout(timer);
  }, [dispatch, search, status, employeeId]);

  const selectedEmployee = employees.find((employee) => String(employee.id) === employeeId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-silver-900">Users</h1>
        <p className="mt-1 text-sm text-silver-500">
          Every user in the system. Users are registered by employees, so pick an employee below
          to see only theirs.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={selectedEmployee ? `${selectedEmployee.fullName}'s users` : "Total users"}
          value={counts.total}
          tone="text-silver-900"
        />
        <StatCard label="Active" value={counts.active} tone="text-emerald-600" />
        <StatCard label="Inactive" value={counts.inactive} tone="text-red-600" />
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="card overflow-hidden">
        <div className="card-header flex-col items-stretch gap-3 lg:flex-row lg:items-center">
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

          <div className="w-full sm:w-64">
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="input"
              title="Show only this employee's users"
            >
              <option value="">Added by: all employees</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName} ({employee.users})
                </option>
              ))}
            </select>
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
          <div className="py-16 text-center text-sm text-silver-500">Loading users...</div>
        ) : list.length === 0 ? (
          <div className="py-16 text-center">
            <span className="mx-auto grid place-items-center w-12 h-12 rounded-full bg-silver-100 text-silver-400">
              <IconUsers className="w-6 h-6" />
            </span>
            <p className="mt-3 text-sm font-medium text-silver-900">No users found</p>
            <p className="mt-1 text-sm text-silver-500">
              {search || status !== "all" || employeeId
                ? "Try a different search or filter."
                : "Users appear here once an employee registers them."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-silver-50 border-b border-silver-200">
                <tr>
                  <th className="table-head">Photo</th>
                  <th className="table-head">Name</th>
                  <th className="table-head">Mobile Number</th>
                  <th className="table-head">Email</th>
                  <th className="table-head">Added By</th>
                  <th className="table-head">Status</th>
                  <th className="table-head text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-silver-200">
                {list.map((user) => (
                  <tr key={user.id} className="hover:bg-silver-50/70 transition-colors">
                    <td className="table-cell">
                      <Avatar user={user} />
                    </td>
                    <td className="table-cell font-medium text-silver-900">
                      {user.name}
                      <div className="text-xs font-normal text-silver-400">
                        Added {formatDate(user.created_at)}
                      </div>
                    </td>
                    <td className="table-cell tabular-nums">
                      {user.mobile ? `+91 ${user.mobile}` : "—"}
                    </td>
                    <td className="table-cell">{user.email}</td>
                    <td className="table-cell">
                      {user.employee_name ? (
                        <>
                          {user.employee_name}
                          <div className="text-xs text-silver-400 tabular-nums">
                            {user.employee_code}
                          </div>
                        </>
                      ) : (
                        <span className="text-silver-400">—</span>
                      )}
                    </td>
                    <td className="table-cell">
                      {user.is_active ? (
                        <span className="badge-success">Active</span>
                      ) : (
                        <span className="badge-danger">Inactive</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center justify-end">
                        <Link
                          to={`/dashboard/users/${user.id}`}
                          className="btn-secondary btn-sm"
                          title="View this user"
                        >
                          <IconEye className="w-3.5 h-3.5" />
                          View
                        </Link>
                      </div>
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
