// The user's own account screen at /user/profile.
//
// Everything the employee recorded when they registered the user is shown here
// read-only - the two things the user owns are their profile photo and their
// password.
//
// The record reads top to bottom across the full width of the page: a banner
// carrying the photo, the name and the four facts people look for first; then
// one details card whose fields are grouped (identity, contact, ID numbers,
// registration) instead of a single twelve-row list; then the documents and the
// password form side by side.
//
// A document opens in the lightbox over the page rather than in a new tab, so
// looking at an ID card doesn't cost the user their place.

import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import PasswordInput from "../components/PasswordInput.jsx";
import Lightbox from "../components/Lightbox.jsx";
import { DOCUMENT_FIELDS, documentUrl } from "../components/DocumentUpload.jsx";
import { fileUrl } from "../api/axios.js";
import {
  changeUserPassword,
  clearUserAuthError,
  fetchUserProfile,
  selectUser,
  updateUserPhoto,
} from "../store/userAuthSlice.js";
import { formatDate, initialsOf } from "../utils/format.js";
import {
  IconCalendar,
  IconCamera,
  IconEye,
  IconIdCard,
  IconKey,
  IconMail,
  IconPhone,
  IconShield,
  IconUser,
} from "../components/Icons.jsx";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

// One label/value pair inside a details group. `wide` gives a long value - an
// address - the whole row to itself.
function Field({ label, value, wide = false }) {
  return (
    <div className={wide ? "sm:col-span-2 lg:col-span-3 xl:col-span-4" : ""}>
      <dt className="text-xs font-medium uppercase tracking-wide text-silver-400">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-silver-900 break-words">{value || "—"}</dd>
    </div>
  );
}

function FieldGroup({ icon, title, children }) {
  return (
    <section className="px-6 py-5">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-silver-500">
        <span className="text-silver-400">{icon}</span>
        {title}
      </h3>
      <dl className="mt-4 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</dl>
    </section>
  );
}

// The banner's quick facts - the same four the old sidebar summary showed.
function MetaTile({ icon, label, value }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-silver-200 bg-silver-50/70 px-3.5 py-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-silver-500 shadow-card">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-xs text-silver-500">{label}</div>
        <div className="truncate text-sm font-medium text-silver-900" title={value || undefined}>
          {value || "—"}
        </div>
      </div>
    </div>
  );
}

// A stored document. Clicking it opens the scan over the page rather than in a
// new tab, so the user keeps their place. View only - replacing one is the
// employee's job.
function DocumentTile({ label, path, onOpen }) {
  if (!path) {
    return (
      <div className="rounded-xl border border-dashed border-silver-300 bg-silver-50 p-3">
        <div className="grid aspect-[4/3] place-items-center text-xs text-silver-400">
          Not uploaded
        </div>
        <p className="mt-2.5 text-xs font-medium text-silver-500">{label}</p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full rounded-xl border border-silver-200 bg-white p-3 text-left transition-all hover:border-silver-400 hover:shadow-lift"
    >
      <div className="relative overflow-hidden rounded-lg bg-silver-50">
        <img src={documentUrl(path)} alt={label} className="aspect-[4/3] w-full object-contain" />
        <span className="absolute inset-0 grid place-items-center bg-silver-900/55 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="badge bg-white/95 text-silver-800">
            <IconEye className="h-3.5 w-3.5" />
            View
          </span>
        </span>
      </div>

      <p className="mt-2.5 flex items-center justify-between gap-2 text-xs font-medium text-silver-700 group-hover:text-silver-900">
        <span className="truncate">{label}</span>
        <IconEye className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
      </p>
    </button>
  );
}

function ChangePasswordCard() {
  const dispatch = useDispatch();
  const { loading, error, passwordChanged } = useSelector((state) => state.userAuth);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mismatch, setMismatch] = useState("");

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
    dispatch(changeUserPassword({ currentPassword, newPassword }));
  }

  return (
    <div className="card flex h-full flex-col">
      <div className="card-header">
        <h2 className="card-title flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-silver-100 text-silver-600">
            <IconKey className="h-4 w-4" />
          </span>
          Change Password
        </h2>
        <span className="text-xs text-silver-500">At least 6 characters</span>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
        <div className="card-body flex-1 space-y-5">
          {passwordChanged && <div className="alert-success">Password changed successfully</div>}
          {(error || mismatch) && <div className="alert-error">{mismatch || error}</div>}

          <div>
            <label className="label">Current Password</label>
            <PasswordInput
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

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

        <div className="border-t border-silver-200 px-6 py-4">
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Saving..." : "Change Password"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function UserProfile() {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const { photoUploading, photoError } = useSelector((state) => state.userAuth);

  const [pickError, setPickError] = useState("");
  const [photoSaved, setPhotoSaved] = useState(false);
  // Which document the lightbox is showing, or null when it is closed.
  const [viewing, setViewing] = useState(null);
  const savedTimer = useRef(null);

  useEffect(() => {
    dispatch(clearUserAuthError());
    dispatch(fetchUserProfile());
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

    const result = await dispatch(updateUserPhoto(file));
    if (updateUserPhoto.fulfilled.match(result)) {
      setPhotoSaved(true);
      savedTimer.current = setTimeout(() => setPhotoSaved(false), 3000);
    }
  }

  const documents = user?.documents || {};
  const photoMessage = pickError || photoError;

  // Only the scans that exist can be paged through in the viewer, so a missing
  // one never shows up as a blank frame between two documents.
  const viewable = DOCUMENT_FIELDS.filter(({ field }) => documents[field]).map(
    ({ field, label }) => ({ field, label, src: documentUrl(documents[field]) })
  );

  return (
    <div className="space-y-6">
      {/* Banner: the photo, the name, and the four facts people look for first. */}
      <section className="card overflow-hidden">
        <div className="relative h-24 bg-gradient-to-r from-silver-900 via-silver-800 to-silver-600 sm:h-28">
          <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:16px_16px]" />
          <span
            className={`absolute right-4 top-4 ${
              user?.is_active ? "badge-success" : "badge-danger"
            }`}
          >
            {user?.is_active ? "Active" : "Inactive"}
          </span>
        </div>

        <div className="px-6 pb-6">
          <div className="-mt-12 flex flex-wrap items-end justify-between gap-4 sm:-mt-14">
            <div className="flex min-w-0 items-end gap-4">
              <label className="group relative shrink-0 cursor-pointer">
                {user?.profile_image ? (
                  <img
                    src={fileUrl(user.profile_image, "user")}
                    alt="Profile"
                    className="h-24 w-24 rounded-2xl border-4 border-white object-cover shadow-lift"
                  />
                ) : (
                  <span className="grid h-24 w-24 place-items-center rounded-2xl border-4 border-white bg-silver-200 text-2xl font-semibold text-silver-700 shadow-lift">
                    {initialsOf(user?.name)}
                  </span>
                )}

                <span className="absolute inset-0 hidden place-items-center rounded-2xl bg-silver-900/55 text-white group-hover:grid">
                  <IconCamera className="h-6 w-6" />
                </span>

                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handlePhotoPick}
                  disabled={photoUploading}
                  className="hidden"
                />
              </label>

              <div className="min-w-0 pb-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-silver-400">
                  My Profile · Customer
                </div>
                <h1 className="truncate text-2xl font-bold text-silver-900">{user?.name || "—"}</h1>
              </div>
            </div>

            <p className="pb-1 text-xs text-silver-500 sm:text-right">
              {photoUploading ? "Uploading..." : "Click the photo to change it"}
              <br />
              JPG, PNG or WebP · max 5MB
            </p>
          </div>

          <p className="mt-4 text-sm text-silver-500">
            Your details as recorded at registration. You can update your photo and password here.
          </p>

          {photoMessage && <div className="alert-error mt-4">{photoMessage}</div>}
          {photoSaved && !photoMessage && (
            <div className="alert-success mt-4">Profile photo updated</div>
          )}

          <div className="mt-5 grid gap-3 border-t border-silver-200 pt-5 sm:grid-cols-2 lg:grid-cols-4">
            <MetaTile icon={<IconMail className="h-4 w-4" />} label="Email" value={user?.email} />
            <MetaTile icon={<IconPhone className="h-4 w-4" />} label="Mobile" value={user?.mobile} />
            <MetaTile
              icon={<IconShield className="h-4 w-4" />}
              label="Account status"
              value={user?.is_active ? "Active" : "Inactive"}
            />
            <MetaTile
              icon={<IconCalendar className="h-4 w-4" />}
              label="Member since"
              value={formatDate(user?.created_at)}
            />
          </div>
        </div>
      </section>

      {/* Everything the employee recorded, grouped rather than one long list. */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Personal Details</h2>
          <span className="badge-neutral">Read only</span>
        </div>

        <div className="divide-y divide-silver-200">
          <FieldGroup icon={<IconUser className="h-4 w-4" />} title="Identity">
            <Field label="Name" value={user?.name} />
            <Field label="First Name" value={user?.first_name} />
            <Field label="Last Name" value={user?.last_name} />
            <Field label="Date of Birth" value={formatDate(user?.date_of_birth)} />
            <Field label="Age" value={user?.age ? `${user.age} years` : ""} />
          </FieldGroup>

          <FieldGroup icon={<IconPhone className="h-4 w-4" />} title="Contact">
            <Field label="Email" value={user?.email} />
            <Field label="Mobile Number" value={user?.mobile} />
            <Field label="Address" value={user?.address} wide />
          </FieldGroup>

          <FieldGroup icon={<IconIdCard className="h-4 w-4" />} title="Identification">
            <Field label="Aadhaar Number" value={user?.aadhaar_number} />
            <Field label="PAN Number" value={user?.pan_number} />
          </FieldGroup>

          <FieldGroup icon={<IconCalendar className="h-4 w-4" />} title="Registration">
            <Field label="Registered By" value={user?.registered_by} />
            <Field label="Member Since" value={formatDate(user?.created_at)} />
          </FieldGroup>
        </div>

        <div className="border-t border-silver-200 bg-silver-50/70 px-6 py-4 text-xs text-silver-500">
          Something out of date? Ask the employee who registered you to update it.
        </div>
      </div>

      {/* Documents, and beside them the one thing the user can change. */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card lg:col-span-3">
          <div className="card-header">
            <h2 className="card-title">My Documents</h2>
            <span className="badge-neutral">Read only</span>
          </div>

          <div className="card-body">
            <div className="grid gap-4 sm:grid-cols-3">
              {DOCUMENT_FIELDS.map(({ field, label }) => (
                <DocumentTile
                  key={field}
                  label={label}
                  path={documents[field]}
                  onOpen={() => setViewing(viewable.findIndex((doc) => doc.field === field))}
                />
              ))}
            </div>
            <p className="mt-4 text-xs text-silver-500">
              Click a document to view it full size. Only your employee can replace these.
            </p>
          </div>
        </div>

        <div className="lg:col-span-2">
          <ChangePasswordCard />
        </div>
      </div>

      <Lightbox
        items={viewable}
        index={viewing}
        onIndex={setViewing}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}
