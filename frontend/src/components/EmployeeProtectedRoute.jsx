// Wraps the employee portal. Signed-out visitors land on the employee login
// page at /employee, and anyone still holding an admin-issued temporary
// password is pushed to their profile first - which shows nothing but the
// change-password form until they've picked their own.

import { Navigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectEmployee, selectIsEmployeeAuthenticated } from "../store/employeeAuthSlice.js";

export default function EmployeeProtectedRoute({ children }) {
  const isAuthenticated = useSelector(selectIsEmployeeAuthenticated);
  const employee = useSelector(selectEmployee);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/employee" replace />;
  }

  const isOnProfile = location.pathname === "/employee/profile";
  if (employee?.mustChangePassword && !isOnProfile) {
    return <Navigate to="/employee/profile" replace />;
  }

  return children;
}
