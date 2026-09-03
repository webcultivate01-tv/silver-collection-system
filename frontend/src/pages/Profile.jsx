// Lets the admin view/edit their name, email and photo, and change their password.
// Laid out as a summary column beside the forms so no card sits half-empty
// across a full row.

import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import api, { fileUrl, apiErrorMessage } from "../api/axios.js";
import PasswordInput from "../components/PasswordInput.jsx";
import { fetchAdminProfile, selectAdmin, setUser } from "../store/authSlice.js";
import { formatDate, initialsOf } from "../utils/format.js";
import { IconCamera, IconKey, IconMail, IconShield, IconUser } from "../components/Icons.jsx";

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

export default function Profile() {
  const dispatch = useDispatch();
  const admin = useSelector(selectAdmin);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [imageError, setImageError] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    dispatch(fetchAdminProfile());
  }, [dispatch]);

  useEffect(() => {
    if (admin) {
      setName(admin.name);
      setEmail(admin.email);
    }
  }, [admin]);

  async function handleImageChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    setImageError("");
    setUploadingImage(true);

    const formData = new FormData();
    formData.append("profileImage", file);

    try {
      const { data } = await api.put("/profile/image", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      dispatch(setUser(data.user));
    } catch (err) {
      setImageError(apiErrorMessage(err, "Could not upload image"));
    } finally {
      setUploadingImage(false);
      e.target.value = "";
    }
  }

  async function handleProfileSubmit(e) {
    e.preventDefault();
    setProfileMessage("");
    setProfileError("");
    setSavingProfile(true);

    try {
      const { data } = await api.put("/profile", { name, email });
      dispatch(setUser(data.user));
      setProfileMessage("Profile updated successfully");
    } catch (err) {
      setProfileError(apiErrorMessage(err, "Could not update profile"));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setPasswordMessage("");
    setPasswordError("");
    setSavingPassword(true);

    try {
      await api.put("/profile/change-password", { currentPassword, newPassword });
      setPasswordMessage("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setPasswordError(apiErrorMessage(err, "Could not change password"));
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-silver-900">My Profile</h1>
        <p className="mt-1 text-sm text-silver-500">Manage your admin account details.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Identity summary */}
        <div className="card h-fit overflow-hidden lg:sticky lg:top-6">
          <div className="relative overflow-hidden bg-gradient-to-br from-silver-800 via-silver-800 to-silver-900 px-5 pb-9 pt-4 text-white">
            <IconShield className="pointer-events-none absolute -right-3 -top-3 h-16 w-16 text-white/[0.06]" />
            <div className="relative text-xs font-semibold uppercase tracking-wider text-white/60">
              Administrator
            </div>
          </div>

          <div className="px-5 pb-5">
            <div className="-mt-7 flex items-end gap-3">
              <label className="group relative cursor-pointer">
                {admin?.profile_image ? (
                  <img
                    src={fileUrl(admin.profile_image, "admin")}
                    alt="Profile"
                    className="h-16 w-16 rounded-full border-4 border-white object-cover shadow-card"
                  />
                ) : (
                  <span className="grid h-16 w-16 place-items-center rounded-full border-4 border-white bg-brand-100 text-lg font-semibold text-brand-700 shadow-card">
                    {initialsOf(name)}
                  </span>
                )}

                <span className="absolute inset-0 hidden place-items-center rounded-full bg-silver-900/55 text-white group-hover:grid">
                  <IconCamera className="h-4 w-4" />
                </span>

                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleImageChange}
                  disabled={uploadingImage}
                  className="hidden"
                />
              </label>

              <p className="pb-1 text-xs text-silver-500">
                {uploadingImage ? "Uploading..." : "Click the photo to change it"}
                <br />
                JPG, PNG or WebP · max 50KB
              </p>
            </div>

            {imageError && <div className="alert-error mt-3">{imageError}</div>}

            <div className="mt-4 space-y-3.5 border-t border-silver-200 pt-4">
              <SummaryRow icon={<IconUser className="h-4 w-4" />} label="Name" value={admin?.name} />
              <SummaryRow
                icon={<IconMail className="h-4 w-4" />}
                label="Email"
                value={admin?.email}
              />
              <SummaryRow
                icon={<IconShield className="h-4 w-4" />}
                label="Role"
                value={admin?.role === "admin" ? "Administrator" : admin?.role}
              />
              <SummaryRow
                icon={<IconKey className="h-4 w-4" />}
                label="Member since"
                value={formatDate(admin?.created_at)}
              />
            </div>
          </div>
        </div>

        {/* Forms */}
        <div className="space-y-6 lg:col-span-2">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Profile Details</h2>
            </div>

            <form onSubmit={handleProfileSubmit}>
              <div className="card-body space-y-5">
                {profileMessage && <div className="alert-success">{profileMessage}</div>}
                {profileError && <div className="alert-error">{profileError}</div>}

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className="label">Name</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Email</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end border-t border-silver-200 px-6 py-4">
                <button type="submit" disabled={savingProfile} className="btn-primary">
                  {savingProfile ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Change Password</h2>
              <span className="text-xs text-silver-500">At least 6 characters</span>
            </div>

            <form onSubmit={handlePasswordSubmit}>
              <div className="card-body space-y-5">
                {passwordMessage && <div className="alert-success">{passwordMessage}</div>}
                {passwordError && <div className="alert-error">{passwordError}</div>}

                <div className="grid gap-5 sm:grid-cols-2">
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
                </div>
              </div>

              <div className="flex justify-end border-t border-silver-200 px-6 py-4">
                <button type="submit" disabled={savingPassword} className="btn-primary">
                  {savingPassword ? "Saving..." : "Change Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
