// Employee login, reached at /employee.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import AuthShell from "../components/AuthShell.jsx";
import PasswordInput from "../components/PasswordInput.jsx";
import {
  clearEmployeeAuthError,
  loginEmployee,
  selectEmployee,
  selectIsEmployeeAuthenticated,
} from "../store/employeeAuthSlice.js";

export default function EmployeeLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error } = useSelector((state) => state.employeeAuth);
  const isAuthenticated = useSelector(selectIsEmployeeAuthenticated);
  const employee = useSelector(selectEmployee);

  useEffect(() => {
    dispatch(clearEmployeeAuthError());
  }, [dispatch]);

  useEffect(() => {
    if (!isAuthenticated) return;
    navigate(employee?.mustChangePassword ? "/employee/profile" : "/employee/portal", {
      replace: true,
    });
  }, [isAuthenticated, employee, navigate]);

  function handleSubmit(e) {
    e.preventDefault();
    dispatch(loginEmployee({ email, password }));
  }

  return (
    <AuthShell
      title="Employee Login"
      subtitle="Use the email and password your admin gave you"
    >
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
            placeholder="you@example.com"
            autoComplete="username"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="label !mb-0">Password</label>
            <Link
              to="/employee/forgot-password"
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

        <button type="submit" disabled={loading} className="btn-amber w-full">
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </AuthShell>
  );
}
