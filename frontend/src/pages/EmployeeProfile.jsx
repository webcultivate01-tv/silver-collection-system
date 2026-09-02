// The employee's own account screen. Everything the admin recorded about them
// is shown here read-only - the two things they own are their profile photo and
// their password.
//
// This is also where an employee still carrying an admin-issued temporary
// password lands (EmployeeProtectedRoute sends them here). Until they pick
// their own password the page shows nothing but the password form, so the
// forced step can't be walked around.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import PasswordInput from "../components/PasswordInput.jsx";
import DocumentGallery from "../components/DocumentGallery.jsx";
import { documentUrl } from "../components/DocumentUpload.jsx";
import {
  changeEmployeePassword,
  clearEmployeeAuthError,
  selectEmployee,
  updateEmployeePhoto,
} from "../store/employeeAuthSlice.js";
import { formatDate, formatDateTime, initialsOf } from "../utils/format.js";
import {
  IconCamera,
  IconIdCard,
  IconKey,
  IconMail,
  IconPhone,
  IconShield,
} from "../components/Icons.jsx";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

// The same three scans the admin panel shows, keyed the way the employee's own
// profile payload carries them (camelCase, not the database columns).
const DOCUMENTS = [
  { field: "aadhaarFront", column: "aadhaarFront", label: "Aadhaar card — Front" },
  { field: "aadhaarBack", column: "aadhaarBack", label: "Aadhaar card — Back" },
  { field: "panFront", column: "panFront", label: "PAN card — Front" },
];

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

function SummaryRow({ icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-silver-100 text-silver-500">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-xs text-silver-500">{label}</div>
        <div className="truncate text-sm font-medium text-silver-900">{value || "—"}</div>
      </div>
    </div>
  );
}

function ChangePasswordCard({ isForced }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error, passwordChanged } = useSelector((state) => state.employeeAuth);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mismatch, setMismatch] = useState("");

  // Only the forced first-login case navigates away; otherwise the employee
  // stays on their profile with the success note.
  useEffect(() => {
    if (passwordChanged && isForced) {
      const timer = setTimeout(() => navigate("/employee/portal", { replace: true }), 1200);
      return () => clearTimeout(timer);
    }
  }, [passwordChanged, isForced, navigate]);

  useEffect(() => {
    if (passwordChanged) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [passwordChanged]);

  function handleSubmit(e) {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      setMismatch("The two new passwords don't match");
      return;
    }

    setMismatch("");
    dispatch(changeEmployeePassword({ currentPassword, newPassword }));
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Change Password</h2>
        <span className="text-xs text-silver-500">At least 6 characters</span>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card-body space-y-5">
          {isForced && (
            <div className="alert-info">
              You're signed in with a temporary password. Choose your own password to continue.
            </div>
          )}
          {passwordChanged && (
            <div className="alert-success">
              {isForced ? "Password changed. Taking you to your portal..." : "Password changed successfully"}
            </div>
          )}
          {(error || mismatch) && <div className="alert-error">{mismatch || error}</div>}

          <div>
            <label className="label">{isForced ? "Temporary Password" : "Current Password"}</label>
            <PasswordInput
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="label">New Password</label>
              <PasswordInput
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="label">Confirm New Password</label>
              <PasswordInput
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-silver-200 px-6 py-4">
          <button type="submit" disabled={loading} className="btn-amber">
            {loading ? "Saving..." : "Change Password"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function EmployeeProfile() {
  const dispatch = useDispatch();
  const employee = useSelector(selectEmployee);
  const { photoUploading, photoError } = useSelector((state) => state.employeeAuth);

  const [pickError, setPickError] = useState("");
  const [photoSaved, setPhotoSaved] = useState(false);
  const savedTimer = useRef(null);

  const isForced = !!employee?.mustChangePassword;

  useEffect(() => {
    dispatch(clearEmployeeAuthError());
    return () => clearTimeout(savedTimer.current);
  }, [dispatch]);

  async function handlePhotoPick(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    setPhotoSaved(false);

    if (!PHOTO_TYPES.includes(file.type)) {
      setPickError("Your photo must be a JPG, PNG or WebP image");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPickError("Your photo must be 5MB or smaller");
      return;
    }

    setPickError("");

    const result = await dispatch(updateEmployeePhoto(file));
    if (updateEmployeePhoto.fulfilled.match(result)) {
      setPhotoSaved(true);
      savedTimer.current = setTimeout(() => setPhotoSaved(false), 3000);
    }
  }

  // On a temporary password there is only one thing to do here.
  if (isForced) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-silver-900">My Profile</h1>
          <p className="mt-1 text-sm text-silver-500">
            Set your own password first — your profile opens right after.
          </p>
        </div>

        <ChangePasswordCard isForced />
      </div>
    );
  }

  const documents = employee?.documents || {};
  const photoMessage = pickError || photoError;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-silver-900">My Profile</h1>
        <p className="mt-1 text-sm text-silver-500">
          Your details as recorded by the admin. You can update your photo and password here.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Identity summary */}
        <div className="card h-fit overflow-hidden lg:sticky lg:top-6">
          <div className="bg-gradient-to-br from-silver-800 to-silver-900 px-6 pb-12 pt-6 text-white">
            <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
              Employee
            </div>
          </div>

          <div className="px-6 pb-6">
            <div className="-mt-10 flex items-end gap-4">
              <label className="group relative cursor-pointer">
                {employee?.profilePhoto ? (
                  <img
                    src={documentUrl(employee.profilePhoto)}
                    alt="Profile"
                    className="h-20 w-20 rounded-full border-4 border-white object-cover shadow-card"
                  />
                ) : (
                  <span className="grid h-20 w-20 place-items-center rounded-full border-4 border-white bg-amber-100 text-xl font-semibold text-amber-700 shadow-card">
                    {initialsOf(employee?.fullName)}
                  </span>
                )}

                <span className="absolute inset-0 hidden place-items-center rounded-full bg-silver-900/55 text-white group-hover:grid">
                  <IconCamera className="h-5 w-5" />
                </span>

                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handlePhotoPick}
                  disabled={photoUploading}
                  className="hidden"
                />
              </label>

              <p className="pb-1 text-xs text-silver-500">
                {photoUploading ? "Uploading..." : "Click the photo to change it"}
                <br />
                JPG, PNG or WebP · max 5MB
              </p>
            </div>

            {photoMessage && <div className="alert-error mt-4">{photoMessage}</div>}
            {photoSaved && !photoMessage && (
              <div className="alert-success mt-4">Profile photo updated</div>
            )}

            <div className="mt-5 space-y-4 border-t border-silver-200 pt-5">
              <SummaryRow
                icon={<IconIdCard className="h-4 w-4" />}
                label="Employee ID"
                value={employee?.employeeCode}
              />
              <SummaryRow
                icon={<IconMail className="h-4 w-4" />}
                label="Email"
                value={employee?.email}
              />
              <SummaryRow
                icon={<IconPhone className="h-4 w-4" />}
                label="Mobile"
                value={employee?.mobile}
              />
              <SummaryRow
                icon={<IconShield className="h-4 w-4" />}
                label="Account status"
                value={employee?.isBlocked ? "Blocked" : "Active"}
              />
              <SummaryRow
                icon={<IconKey className="h-4 w-4" />}
                label="Registered on"
                value={formatDate(employee?.registeredOn)}
              />
            </div>
          </div>
        </div>

        {/* Details, documents, password */}
        <div className="space-y-6 lg:col-span-2">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Personal Details</h2>
              <span className="badge badge-neutral">Read only</span>
            </div>

            <div className="divide-y divide-silver-200 px-6">
              <DetailRow label="Employee ID" value={employee?.employeeCode} />
              <DetailRow label="First Name" value={employee?.firstName} />
              <DetailRow label="Last Name" value={employee?.lastName} />
              <DetailRow label="Email" value={employee?.email} />
              <DetailRow label="Mobile Number" value={employee?.mobile} />
              <DetailRow label="Alternate Mobile" value={employee?.alternateMobile} />
              <DetailRow label="Date of Birth" value={formatDate(employee?.dateOfBirth)} />
              <DetailRow label="Age" value={employee?.age ? `${employee.age} years` : ""} />
              <DetailRow label="Aadhaar Number" value={employee?.aadhaarNumber} />
              <DetailRow label="PAN Number" value={employee?.panNumber} />
              <DetailRow label="Address" value={employee?.address} />
              <DetailRow label="Registered On" value={formatDate(employee?.registeredOn)} />
              <DetailRow label="Last Updated" value={formatDateTime(employee?.lastUpdatedOn)} />
            </div>

            <div className="border-t border-silver-200 px-6 py-4 text-xs text-silver-500">
              Something out of date? Ask your admin to update it.
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">My Documents</h2>
              <span className="badge badge-neutral">Read only</span>
            </div>

            <div className="card-body">
              {/* No `canDownload`: the scans can be looked at here, but only
                  the admin panel can save a copy off the screen. */}
              <DocumentGallery
                record={documents}
                fields={DOCUMENTS}
                owner={employee?.fullName}
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              />
              <p className="mt-4 text-xs text-silver-500">
                Click a document to open it full size. Only your admin can replace these.
              </p>
            </div>
          </div>

          <ChangePasswordCard isForced={false} />
        </div>
      </div>
    </div>
  );
}
