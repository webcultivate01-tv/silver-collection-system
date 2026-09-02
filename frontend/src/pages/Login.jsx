// Admin login, reached at /admin.
// The main admin and sub-admins both sign in here; the account's role decides
// which dashboard they land on.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import AuthShell from "../components/AuthShell.jsx";
import PasswordInput from "../components/PasswordInput.jsx";
import {
  clearAuthError,
  loginAdmin,
  selectAdminHomePath,
  selectIsAdminAuthenticated,
} from "../store/authSlice.js";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error, sessionNotice } = useSelector((state) => state.auth);
  const isAuthenticated = useSelector(selectIsAdminAuthenticated);
  const homePath = useSelector(selectAdminHomePath);

  useEffect(() => {
    dispatch(clearAuthError());
  }, [dispatch]);

  useEffect(() => {
    if (isAuthenticated) navigate(homePath, { replace: true });
  }, [isAuthenticated, homePath, navigate]);

  function handleSubmit(e) {
    e.preventDefault();
    dispatch(loginAdmin({ email, password }));
  }

  return (
    <AuthShell
      title="Admin Login"
      subtitle="Sign in to open the admin dashboard"
    >
      {/* Why the previous session ended, e.g. the account was deactivated. */}
      {sessionNotice && !error && <div className="alert-error mb-5">{sessionNotice}</div>}
      {error && <div className="alert-error mb-5">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="label">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="admin@gmail.com"
            autoComplete="username"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="label !mb-0">Password</label>
            <Link
              to="/admin/forgot-password"
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </AuthShell>
  );
}
