// Wraps pages that require a signed-in admin-panel account.
//
//   * no token            -> back to the admin login
//   * wrong role for the  -> quietly bounced to that role's own dashboard,
//     page being opened      which then explains what happened
//
// This is the client-side half of the rule. The server enforces the same thing
// on every request, so typing a URL by hand gets you a redirect here and a 403
// from the API even if you got past this.

import { Navigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import {
  ROLE_ADMIN,
  homePathForRole,
  selectAdminRole,
  selectIsAdminAuthenticated,
} from "../store/authSlice.js";

export default function ProtectedRoute({ children, allow = [ROLE_ADMIN] }) {
  const isAuthenticated = useSelector(selectIsAdminAuthenticated);
  const role = useSelector(selectAdminRole);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/admin" replace />;
  }

  // `role` is only null for a session saved before roles existed; the profile
  // fetch fills it in a moment later, so don't bounce anyone over it.
  if (role && !allow.includes(role)) {
    return (
      <Navigate to={homePathForRole(role)} replace state={{ deniedFrom: location.pathname }} />
    );
  }

  return children;
}
