// Wraps the user portal. Signed-out visitors land on the user login page.

import { Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectIsUserAuthenticated } from "../store/userAuthSlice.js";

export default function UserProtectedRoute({ children }) {
  const isAuthenticated = useSelector(selectIsUserAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/user" replace />;
  }

  return children;
}
