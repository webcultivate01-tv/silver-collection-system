// Admin Management - main admin only.
//
// One place to see every admin/sub-admin account and to create, edit,
// activate/deactivate or delete a sub-admin. The main admin's own row is shown
// for context but has no actions: it can't be deactivated or deleted.

import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  clearAdminErrors,
  clearAdminNotice,
  createSubAdmin,
  deleteSubAdmin,
  fetchAdmins,
  setSubAdminStatus,
  updateSubAdmin,
} from "../../store/adminsSlice.js";
import ConfirmModal from "../../components/ConfirmModal.jsx";
import PasswordInput from "../../components/PasswordInput.jsx";
import { formatDate, initialsOf } from "../../utils/format.js";
import {
  IconAdmins,
  IconBlock,
  IconCheck,
  IconClose,
  IconEdit,
  IconPlus,
  IconSearch,
  IconTrash,
} from "../../components/Icons.jsx";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "inactive", label: "Deactivated" },
];

const EMPTY_FORM = { name: "", email: "", password: "" };

function StatCard({ label, value, tone }) {
  return (
    <div className="card px-5 py-4">
      <div className="text-sm text-silver-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

// Create + edit share one dialog; `account` being set switches it to edit mode,
// where the password field means "leave blank to keep the current one".
function SubAdminForm({ account, values, onChange, onSubmit, onClose, saving, error, fieldErrors }) {
  const isEdit = !!account;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-silver-900/40 backdrop-blur-sm" onClick={onClose} />

      <form onSubmit={onSubmit} className="relative w-full max-w-md card shadow-lift animate-fade-in">
        <div className="card-header">
          <h2 className="card-title">{isEdit ? "Edit Sub-Admin" : "Create Sub-Admin"}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-silver-400 hover:text-silver-600"
            aria-label="Close"
          >
            <IconClose />
          </button>
        </div>

        <div className="card-body space-y-5">
          {error && <div className="alert-error">{error}</div>}

          <div>
            <label className="label">Full Name</label>
            <input
              type="text"
              required
              autoFocus
              value={values.name}
              onChange={(e) => onChange("name", e.target.value)}
              className={`input ${fieldErrors.name ? "input-error" : ""}`}
              placeholder="e.g. Priya Sharma"
            />
            {fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
          </div>

          <div>
            <label className="label">Email</label>
            <input
              type="email"
              required
              value={values.email}
              onChange={(e) => onChange("email", e.target.value)}
              className={`input ${fieldErrors.email ? "input-error" : ""}`}
              placeholder="subadmin@example.com"
              autoComplete="off"
            />
            {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
            <p className="mt-1.5 text-xs text-silver-500">
              They sign in with this at the admin login page.
            </p>
          </div>

          <div>
            <label className="label">
              {isEdit ? "New Password (optional)" : "Password"}
            </label>
            <PasswordInput
              required={!isEdit}
              minLength={6}
              value={values.password}
              onChange={(e) => onChange("password", e.target.value)}
              placeholder={isEdit ? "Leave blank to keep current" : "At least 6 characters"}
              autoComplete="new-password"
              className={fieldErrors.password ? "input-error" : ""}
            />
            {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}
          </div>

          <div className="rounded-lg border border-silver-200 bg-silver-50 px-4 py-3 text-xs text-silver-600">
            A sub-admin can sign in, view the reports and download them. They cannot create,
            edit or delete anything, and Admin Management stays closed to them.
          </div>
        </div>

        <div className="px-6 py-4 border-t border-silver-200 flex justify-end gap-3">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Sub-Admin"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AdminManagement() {
  const dispatch = useDispatch();
  const { list, counts, loading, saving, error, fieldErrors, notice } = useSelector(
    (state) => state.admins
  );

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  // null = closed, { account: null } = create, { account } = edit
  const [form, setForm] = useState(null);
  const [values, setValues] = useState(EMPTY_FORM);
  // { action: "activate" | "deactivate" | "delete", account }
  const [confirm, setConfirm] = useState(null);

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => dispatch(fetchAdmins({ search, status })), 300);
    return () => clearTimeout(timer);
  }, [dispatch, search, status]);

  useEffect(() => () => dispatch(clearAdminNotice()), [dispatch]);

  function openCreate() {
    dispatch(clearAdminErrors());
    setValues(EMPTY_FORM);
    setForm({ account: null });
  }

  function openEdit(account) {
    dispatch(clearAdminErrors());
    setValues({ name: account.name, email: account.email, password: "" });
    setForm({ account });
  }

  function closeForm() {
    dispatch(clearAdminErrors());
    setForm(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    dispatch(clearAdminNotice());

    const payload = {
      name: values.name,
      email: values.email,
      ...(values.password ? { password: values.password } : {}),
    };

    const result = form.account
      ? await dispatch(updateSubAdmin({ id: form.account.id, ...payload }))
      : await dispatch(createSubAdmin(payload));

    if (result.error) return;

    setForm(null);
    // Re-read the list so the new row lands in the server's sort order and
    // drops straight out again if the current filter excludes it.
    dispatch(fetchAdmins({ search, status }));
  }

  async function handleConfirm() {
    const { action, account } = confirm;
    dispatch(clearAdminNotice());

    const result =
      action === "delete"
        ? await dispatch(deleteSubAdmin({ id: account.id, key: account.key }))
        : await dispatch(setSubAdminStatus({ id: account.id, active: action === "activate" }));

    setConfirm(null);
    if (!result.error) dispatch(fetchAdmins({ search, status }));
  }

  const confirmProps = !confirm
    ? {}
    : {
        deactivate: {
          title: "Deactivate this sub-admin?",
          message: `${confirm.account.name} will be signed out and won't be able to log in until you activate them again.`,
          confirmLabel: "Deactivate",
          confirmVariant: "btn-danger",
        },
        activate: {
          title: "Activate this sub-admin?",
          message: `${confirm.account.name} will be able to log in again with their existing password.`,
          confirmLabel: "Activate",
          confirmVariant: "btn-primary",
        },
        delete: {
          title: "Delete this sub-admin?",
          message: `${confirm.account.name}'s account will be permanently removed. This cannot be undone.`,
          confirmLabel: "Delete permanently",
          confirmVariant: "btn-danger",
        },
      }[confirm.action];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-silver-900">Admin Management</h1>
          <p className="mt-1 text-sm text-silver-500">
            Create sub-admins and control who can sign in to the admin panel.
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <IconPlus className="w-4 h-4" />
          Create Sub-Admin
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Sub-admins" value={counts.subAdmins} tone="text-silver-900" />
        <StatCard label="Active" value={counts.activeSubAdmins} tone="text-emerald-600" />
        <StatCard label="Deactivated" value={counts.inactiveSubAdmins} tone="text-red-600" />
      </div>

      {notice && <div className="alert-success">{notice}</div>}
      {error && !form && <div className="alert-error">{error}</div>}

      <div className="card overflow-hidden">
        <div className="card-header flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-silver-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9"
              placeholder="Search by name or email"
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
          <div className="py-16 text-center text-sm text-silver-500">Loading accounts...</div>
        ) : list.length === 0 ? (
          <div className="py-16 text-center">
            <span className="mx-auto grid place-items-center w-12 h-12 rounded-full bg-silver-100 text-silver-400">
              <IconAdmins className="w-6 h-6" />
            </span>
            <p className="mt-3 text-sm font-medium text-silver-900">No accounts found</p>
            <p className="mt-1 text-sm text-silver-500">
              {search || status !== "all"
                ? "Try a different search or filter."
                : "Create your first sub-admin to get started."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="bg-silver-50 border-b border-silver-200">
                <tr>
                  <th className="table-head">Name</th>
                  <th className="table-head">Email</th>
                  <th className="table-head">Role</th>
                  <th className="table-head">Status</th>
                  <th className="table-head">Created</th>
                  <th className="table-head text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-silver-200">
                {list.map((account) => (
                  <tr key={account.key} className="hover:bg-silver-50/70 transition-colors">
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                          {initialsOf(account.name)}
                        </span>
                        <span className="font-medium text-silver-900">{account.name}</span>
                      </div>
                    </td>
                    <td className="table-cell">{account.email}</td>
                    <td className="table-cell">
                      {account.isMainAdmin ? (
                        <span className="badge-neutral">Main Admin</span>
                      ) : (
                        <span className="badge-neutral">Sub-Admin</span>
                      )}
                    </td>
                    <td className="table-cell">
                      {account.isActive ? (
                        <span className="badge-success">Active</span>
                      ) : (
                        <span className="badge-danger">Deactivated</span>
                      )}
                    </td>
                    <td className="table-cell text-silver-500">
                      {formatDate(account.createdAt)}
                    </td>
                    <td className="table-cell">
                      {account.isMainAdmin ? (
                        <div className="text-right text-xs text-silver-400">
                          Managed from My Profile
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            disabled={saving}
                            onClick={() => openEdit(account)}
                            className="btn-secondary btn-sm"
                            title="Edit this sub-admin"
                          >
                            <IconEdit className="w-3.5 h-3.5" />
                            Edit
                          </button>

                          <button
                            disabled={saving}
                            onClick={() =>
                              setConfirm({
                                action: account.isActive ? "deactivate" : "activate",
                                account,
                              })
                            }
                            className={`btn-sm ${account.isActive ? "btn-secondary" : "btn-primary"}`}
                            title={
                              account.isActive
                                ? "Deactivate this sub-admin"
                                : "Activate this sub-admin"
                            }
                          >
                            {account.isActive ? (
                              <IconBlock className="w-3.5 h-3.5" />
                            ) : (
                              <IconCheck className="w-3.5 h-3.5" />
                            )}
                            {account.isActive ? "Deactivate" : "Activate"}
                          </button>

                          <button
                            disabled={saving}
                            onClick={() => setConfirm({ action: "delete", account })}
                            className="btn-danger btn-sm"
                            title="Delete this sub-admin"
                          >
                            <IconTrash className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {form && (
        <SubAdminForm
          account={form.account}
          values={values}
          onChange={(field, value) => setValues((prev) => ({ ...prev, [field]: value }))}
          onSubmit={handleSubmit}
          onClose={closeForm}
          saving={saving}
          error={error}
          fieldErrors={fieldErrors}
        />
      )}

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
