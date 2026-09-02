// Two-step "Forgot password" flow on a single page:
//   Step 1: enter email -> backend emails a 6-digit OTP
//   Step 2: enter that OTP + a new password -> password gets reset
//
// All three roles get the identical flow; only the endpoints and the login
// page to return to differ, so App.jsx renders this once per role.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiErrorMessage } from "../api/axios.js";
import AuthShell, { AuthSwitchLink } from "../components/AuthShell.jsx";
import PasswordInput from "../components/PasswordInput.jsx";

const ROLES = {
  admin: {
    title: "Admin — Forgot Password",
    loginPath: "/admin",
    forgotUrl: "/auth/forgot-password",
    resetUrl: "/auth/reset-password",
    // Scopes the reset to this role so one login page can't reset another's account.
    payload: { role: "admin" },
    button: "btn-primary",
    placeholder: "admin@gmail.com",
  },
  user: {
    title: "User — Forgot Password",
    loginPath: "/user",
    forgotUrl: "/auth/forgot-password",
    resetUrl: "/auth/reset-password",
    payload: { role: "user" },
    button: "btn-primary",
    placeholder: "you@example.com",
  },
  employee: {
    title: "Employee — Forgot Password",
    loginPath: "/employee",
    forgotUrl: "/employee/forgot-password",
    resetUrl: "/employee/reset-password",
    payload: {},
    button: "btn-amber",
    placeholder: "you@example.com",
  },
};

export default function ForgotPassword({ role = "admin" }) {
  const config = ROLES[role];

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  async function handleSendOtp(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post(config.forgotUrl, { ...config.payload, email });
      setMessage(data.message);
      setStep(2);
    } catch (err) {
      setError(apiErrorMessage(err, "Something went wrong. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post(config.resetUrl, { ...config.payload, email, otp, newPassword });
      navigate(config.loginPath);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not reset password. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title={config.title}
      subtitle={
        step === 1
          ? "Enter your email and we'll send you an OTP"
          : "Enter the OTP and choose a new password"
      }
      footer={
        <AuthSwitchLink to={config.loginPath} label="Remembered it?" action="Back to login" />
      }
    >
      {message && <div className="alert-success mb-5">{message}</div>}
      {error && <div className="alert-error mb-5">{error}</div>}

      {step === 1 ? (
        <form onSubmit={handleSendOtp} className="space-y-5">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder={config.placeholder}
              autoComplete="username"
            />
          </div>
          <button type="submit" disabled={loading} className={`${config.button} w-full`}>
            {loading ? "Sending..." : "Send OTP"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleResetPassword} className="space-y-5">
          <div>
            <label className="label">OTP</label>
            <input
              type="text"
              required
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="input tracking-[0.4em] text-center font-semibold"
              placeholder="000000"
              maxLength={6}
            />
            <p className="mt-1.5 text-xs text-silver-500">Valid for 10 minutes, single use.</p>
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
          <button type="submit" disabled={loading} className={`${config.button} w-full`}>
            {loading ? "Resetting..." : "Reset Password"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
