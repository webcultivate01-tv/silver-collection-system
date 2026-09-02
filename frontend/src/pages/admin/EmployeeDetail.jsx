// One employee: full details, uploaded documents, inline editing,
// password reset, block/unblock and delete.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import EmployeeForm, { validate } from "./EmployeeForm.jsx";
import ConfirmModal from "../../components/ConfirmModal.jsx";
import CredentialBox from "../../components/CredentialBox.jsx";
import DocumentGallery from "../../components/DocumentGallery.jsx";
import { documentUrl } from "../../components/DocumentUpload.jsx";
import { selectCanDownloadDocuments } from "../../store/authSlice.js";
import {
  clearEmployeeErrors,
  clearIssuedPassword,
  clearSelectedEmployee,
  deleteEmployee,
  fetchEmployee,
  resetEmployeePassword,
  toggleEmployeeBlock,
  updateEmployee,
} from "../../store/employeesSlice.js";
import {
  formatAadhaar,
  formatDate,
  formatDateTime,
  initialsOf,
  toDateInputValue,
} from "../../utils/format.js";
import {
  IconArrowLeft,
  IconBlock,
  IconCheck,
  IconCollection,
  IconKey,
  IconPrint,
  IconTrash,
} from "../../components/Icons.jsx";
import { printEmployee } from "../../utils/printEmployee.js";

function DetailRow({ label, value }) {
  return (
    <div className="py-3.5 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-silver-500">{label}</dt>
      <dd className="mt-0.5 sm:mt-0 sm:col-span-2 text-sm font-medium text-silver-900 break-words">
        {value || "—"}
      </dd>
    </div>
  );
}

function toFormValues(employee) {
  return {
    firstName: employee.first_name || "",
    lastName: employee.last_name || "",
    mobile: employee.mobile,
    alternateMobile: employee.alternate_mobile || "",
    email: employee.email,
    age: String(employee.age),
    address: employee.address,
    aadhaarNumber: employee.aadhaar_number,
    panNumber: employee.pan_number || "",
    dateOfBirth: toDateInputValue(employee.date_of_birth),
    // Only set when the admin picks a replacement file.
    profilePhoto: null,
    aadhaarFront: null,
    aadhaarBack: null,
    panFront: null,
  };
}

export default function EmployeeDetail() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { selected, loading, saving, error, fieldErrors, issuedPassword } = useSelector(
    (state) => state.employees
  );

  // Admin and sub-admin may take a copy of an ID scan away; nobody else can.
  const canDownload = useSelector(selectCanDownloadDocuments);

  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(null);
  const [localErrors, setLocalErrors] = useState({});
  const [confirm, setConfirm] = useState(null); // "reset" | "block" | "unblock" | "delete"
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    dispatch(fetchEmployee(id));
    return () => {
      dispatch(clearSelectedEmployee());
      dispatch(clearIssuedPassword());
      dispatch(clearEmployeeErrors());
    };
  }, [dispatch, id]);

  if (loading && !selected) {
    return <div className="py-16 text-center text-sm text-silver-500">Loading employee...</div>;
  }

  if (!selected) {
    return (
      <div className="max-w-md space-y-4">
        {error && <div className="alert-error">{error}</div>}
        <Link to="/dashboard/employees" className="btn-secondary">
          Back to employees
        </Link>
      </div>
    );
  }

  function startEditing() {
    setValues(toFormValues(selected));
    setLocalErrors({});
    setSavedMessage("");
    dispatch(clearEmployeeErrors());
    setEditing(true);
  }

  async function handleSave(e) {
    e.preventDefault();

    const found = validate(values);
    setLocalErrors(found);
    if (Object.keys(found).length) return;

    const result = await dispatch(
      updateEmployee({ id: selected.id, ...values, age: Number(values.age) })
    );

    if (updateEmployee.fulfilled.match(result)) {
      setEditing(false);
      setSavedMessage("Employee details updated");
    }
  }

  async function handleConfirm() {
    if (confirm === "reset") {
      await dispatch(resetEmployeePassword(selected.id));
    } else if (confirm === "delete") {
      const result = await dispatch(deleteEmployee(selected.id));
      setConfirm(null);
      if (!result.error) navigate("/dashboard/employees");
      return;
    } else {
      await dispatch(toggleEmployeeBlock({ id: selected.id, blocked: confirm === "block" }));
    }
    setConfirm(null);
  }

  const confirmProps = {
    reset: {
      title: "Reset password?",
      message: `A new temporary password will be generated for ${selected.full_name}. Their current password will stop working immediately.`,
      confirmLabel: "Reset password",
      confirmVariant: "btn-primary",
    },
    block: {
      title: "Block this employee?",
      message: `${selected.full_name} will be signed out and won't be able to log in until you unblock them.`,
      confirmLabel: "Block employee",
      confirmVariant: "btn-danger",
    },
    unblock: {
      title: "Unblock this employee?",
      message: `${selected.full_name} will be able to log in again with their existing password.`,
      confirmLabel: "Unblock employee",
      confirmVariant: "btn-primary",
    },
    delete: {
      title: "Delete this employee?",
      message: `${selected.full_name}'s record and every uploaded document will be permanently removed from the server. This cannot be undone.`,
      confirmLabel: "Delete permanently",
      confirmVariant: "btn-danger",
    },
  }[confirm] || {};

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link
          to="/dashboard/employees"
          className="inline-flex items-center gap-1.5 text-sm text-silver-500 hover:text-silver-800"
        >
          <IconArrowLeft className="w-4 h-4" />
          Employees
        </Link>
      </div>

      {/* Header */}
      <div className="card">
        <div className="p-6 flex flex-wrap items-center gap-5">
          {selected.profile_photo ? (
            <img
              src={documentUrl(selected.profile_photo)}
              alt={selected.full_name}
              className="h-16 w-16 shrink-0 rounded-full border border-silver-200 object-cover"
            />
          ) : (
            <span className="grid place-items-center w-16 h-16 shrink-0 rounded-full bg-brand-100 text-brand-700 text-lg font-semibold">
              {initialsOf(selected.full_name)}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-bold text-silver-900">{selected.full_name}</h1>
              {selected.employee_code && (
                <span className="badge-neutral tabular-nums">{selected.employee_code}</span>
              )}
              {selected.is_blocked ? (
                <span className="badge-danger">Blocked</span>
              ) : selected.must_change_password ? (
                <span className="badge-warning">Pending password setup</span>
              ) : (
                <span className="badge-success">Active</span>
              )}
            </div>
            <p className="mt-1 text-sm text-silver-500">
              {selected.email} · Registered {formatDate(selected.created_at)}
            </p>
          </div>

          {!editing && (
            <div className="flex flex-wrap gap-3">
              <Link to={`/dashboard/collections/${selected.id}`} className="btn-secondary">
                <IconCollection className="w-4 h-4" />
                Collections
              </Link>
              <button className="btn-secondary" onClick={() => printEmployee(selected)}>
                <IconPrint className="w-4 h-4" />
                Print details
              </button>
              <button className="btn-secondary" onClick={startEditing}>
                Edit details
              </button>
            </div>
          )}
        </div>
      </div>

      {savedMessage && <div className="alert-success">{savedMessage}</div>}
      {error && <div className="alert-error">{error}</div>}
      {issuedPassword && (
        <CredentialBox
          email={selected.email}
          password={issuedPassword}
          title="New temporary password"
        />
      )}

      {editing ? (
        <form onSubmit={handleSave}>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Edit Details</h2>
            </div>
            <div className="card-body">
              <EmployeeForm
                values={values}
                errors={{ ...fieldErrors, ...localErrors }}
                onChange={setValues}
                existing={selected}
              />
            </div>
            <div className="px-6 py-4 border-t border-silver-200 flex justify-end gap-3">
              <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Employee Details</h2>
              </div>
              <div className="px-6 divide-y divide-silver-200">
                <DetailRow label="Employee ID" value={selected.employee_code} />
                <DetailRow label="First Name" value={selected.first_name} />
                <DetailRow label="Last Name" value={selected.last_name} />
                <DetailRow label="Mobile Number" value={`+91 ${selected.mobile}`} />
                <DetailRow
                  label="Alternate Mobile"
                  value={selected.alternate_mobile ? `+91 ${selected.alternate_mobile}` : ""}
                />
                <DetailRow label="Email" value={selected.email} />
                <DetailRow label="Date of Birth" value={formatDate(selected.date_of_birth)} />
                <DetailRow label="Age" value={`${selected.age} years`} />
                <DetailRow label="Aadhaar Number" value={formatAadhaar(selected.aadhaar_number)} />
                <DetailRow label="PAN Number" value={selected.pan_number} />
                <DetailRow label="Address" value={selected.address} />
                <DetailRow label="Registered On" value={formatDateTime(selected.created_at)} />
                {selected.is_blocked && (
                  <DetailRow label="Blocked On" value={formatDateTime(selected.blocked_at)} />
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Documents</h2>
                <span className="text-xs text-silver-500">
                  Stored in /uploads/employees/{selected.folder_name}
                </span>
              </div>
              <div className="card-body">
                <DocumentGallery
                  record={selected}
                  owner={selected.full_name || selected.name}
                  canDownload={canDownload}
                  className="grid gap-4 sm:grid-cols-3"
                />
                <p className="mt-3 text-xs text-silver-500">
                  Click a document to open it full size
                  {canDownload && ", then Download to save a copy"}.
                </p>
              </div>
            </div>
          </div>

          <div className="card h-fit">
            <div className="card-header">
              <h2 className="card-title">Actions</h2>
            </div>
            <div className="card-body space-y-5">
              <div>
                <button
                  className="btn-secondary w-full"
                  disabled={saving}
                  onClick={() => setConfirm("reset")}
                >
                  <IconKey className="w-4 h-4" />
                  Reset Password
                </button>
                <p className="mt-2 text-xs text-silver-500">
                  Use this when the employee forgets their password.
                </p>
              </div>

              <div className="border-t border-silver-200 pt-5">
                {selected.is_blocked ? (
                  <>
                    <button
                      className="btn-primary w-full"
                      disabled={saving}
                      onClick={() => setConfirm("unblock")}
                    >
                      <IconCheck className="w-4 h-4" />
                      Unblock Employee
                    </button>
                    <p className="mt-2 text-xs text-silver-500">
                      Restores access to the employee portal.
                    </p>
                  </>
                ) : (
                  <>
                    <button
                      className="btn-secondary w-full"
                      disabled={saving}
                      onClick={() => setConfirm("block")}
                    >
                      <IconBlock className="w-4 h-4" />
                      Block Employee
                    </button>
                    <p className="mt-2 text-xs text-silver-500">
                      Temporarily stops them from signing in. Their record is kept.
                    </p>
                  </>
                )}
              </div>

              <div className="border-t border-silver-200 pt-5">
                <button
                  className="btn-danger w-full"
                  disabled={saving}
                  onClick={() => setConfirm("delete")}
                >
                  <IconTrash className="w-4 h-4" />
                  Delete Employee
                </button>
                <p className="mt-2 text-xs text-silver-500">
                  Removes the record and every uploaded document for good.
                </p>
              </div>
            </div>
          </div>
        </div>
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
