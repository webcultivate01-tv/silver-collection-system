// User Management in the employee portal: every user this employee registered,
// with search and a status filter. Users added by another employee are never
// returned by the API, so this list is always only their own.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchMyUsers, toggleUserStatus } from "../store/employeeUsersSlice.js";
import ConfirmModal from "../components/ConfirmModal.jsx";
import { documentUrl } from "../components/DocumentUpload.jsx";
import { initialsOf } from "../utils/format.js";
import {
  IconBlock,
  IconCheck,
  IconEye,
  IconPlus,
  IconSearch,
  IconUsers,
} from "../components/Icons.jsx";

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

export default function EmployeeUsers() {
  const dispatch = useDispatch();
  const { list, counts, loading, saving, error } = useSelector((state) => state.employeeUsers);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  // { action: "activate" | "deactivate", user }
  const [confirm, setConfirm] = useState(null);
  const [notice, setNotice] = useState("");

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => dispatch(fetchMyUsers({ search, status })), 300);
    return () => clearTimeout(timer);
  }, [dispatch, search, status]);

  async function handleConfirm() {
    const { action, user } = confirm;
    const active = action === "activate";

    const result = await dispatch(toggleUserStatus({ id: user.id, active }));

    if (!result.error) {
      setNotice(`${user.name} has been ${active ? "activated" : "deactivated"}.`);
    }
    setConfirm(null);
  }

  const confirmProps = !confirm
    ? {}
    : {
        deactivate: {
          title: "Deactivate this user?",
          message: `${confirm.user.name} won't be able to sign in, and no purchase can be recorded for them until you activate them again. Their silver is kept.`,
          confirmLabel: "Deactivate user",
          confirmVariant: "btn-danger",
        },
        activate: {
          title: "Activate this user?",
          message: `${confirm.user.name} will be able to sign in again with their existing password.`,
          confirmLabel: "Activate user",
          confirmVariant: "btn-primary",
        },
      }[confirm.action];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-silver-900">My Users</h1>
          <p className="mt-1 text-sm text-silver-500">
            Register the users you look after and manage their portal access. Only you can see
            the users you add.
          </p>
        </div>
        <Link to="/employee/users/new" className="btn-primary">
          <IconPlus className="w-4 h-4" />
          Add User
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="My users" value={counts.total} tone="text-silver-900" />
        <StatCard label="Active" value={counts.active} tone="text-emerald-600" />
        <StatCard label="Inactive" value={counts.inactive} tone="text-red-600" />
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
          <div className="py-16 text-center text-sm text-silver-500">Loading users...</div>
        ) : list.length === 0 ? (
          <div className="py-16 text-center">
            <span className="mx-auto grid place-items-center w-12 h-12 rounded-full bg-silver-100 text-silver-400">
              <IconUsers className="w-6 h-6" />
            </span>
            <p className="mt-3 text-sm font-medium text-silver-900">No users found</p>
            <p className="mt-1 text-sm text-silver-500">
              {search || status !== "all"
                ? "Try a different search or filter."
                : "Add your first user to get started."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
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
                {list.map((user) => (
                  <tr key={user.id} className="hover:bg-silver-50/70 transition-colors">
                    <td className="table-cell">
                      <Avatar user={user} />
                    </td>
                    <td className="table-cell font-medium text-silver-900">
                      {user.first_name || user.name}
                    </td>
                    <td className="table-cell font-medium text-silver-900">
                      {user.last_name || "—"}
                    </td>
                    <td className="table-cell tabular-nums">
                      {user.mobile ? `+91 ${user.mobile}` : "—"}
                    </td>
                    <td className="table-cell">{user.email}</td>
                    <td className="table-cell">
                      {user.is_active ? (
                        <span className="badge-success">Active</span>
                      ) : (
                        <span className="badge-danger">Inactive</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/employee/users/${user.id}`}
                          className="btn-secondary btn-sm"
                          title="View this user"
                        >
                          <IconEye className="w-3.5 h-3.5" />
                          View
                        </Link>

                        <button
                          disabled={saving}
                          onClick={() =>
                            setConfirm({
                              action: user.is_active ? "deactivate" : "activate",
                              user,
                            })
                          }
                          className={`btn-sm ${user.is_active ? "btn-secondary" : "btn-primary"}`}
                          title={user.is_active ? "Deactivate this user" : "Activate this user"}
                        >
                          {user.is_active ? (
                            <IconBlock className="w-3.5 h-3.5" />
                          ) : (
                            <IconCheck className="w-3.5 h-3.5" />
                          )}
                          {user.is_active ? "Deactivate" : "Activate"}
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
