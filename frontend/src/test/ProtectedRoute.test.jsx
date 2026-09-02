// The route guards.
//
// These are convenience, not security - the server enforces the same rules on
// every request. What they have to get right is not letting a sub-admin land
// on an admin screen that will then fail every API call it makes, and not
// bouncing a legitimate session out of the app.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import ProtectedRoute from "../components/ProtectedRoute.jsx";
import EmployeeProtectedRoute from "../components/EmployeeProtectedRoute.jsx";
import UserProtectedRoute from "../components/UserProtectedRoute.jsx";
import authReducer, { ROLE_ADMIN, ROLE_SUB_ADMIN, homePathForRole } from "../store/authSlice.js";
import employeeAuthReducer from "../store/employeeAuthSlice.js";
import userAuthReducer from "../store/userAuthSlice.js";

function storeWith(preloadedState) {
  return configureStore({
    reducer: {
      auth: authReducer,
      employeeAuth: employeeAuthReducer,
      userAuth: userAuthReducer,
    },
    preloadedState,
  });
}

// Renders the guard at `at`, with landing pages for every place it could
// redirect to, so the assertion is "where did it end up".
function renderGuard(guard, { store, at = "/dashboard" }) {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path={at} element={guard} />
          <Route path="/admin" element={<div>Admin login</div>} />
          <Route path="/employee" element={<div>Employee login</div>} />
          <Route path="/employee/profile" element={<div>Employee profile</div>} />
          <Route path="/user" element={<div>User login</div>} />
          <Route path="/dashboard" element={<div>Admin dashboard</div>} />
          <Route path="/sub-admin" element={<div>Sub-admin dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

const protectedContent = <div>Protected content</div>;

describe("ProtectedRoute - the admin panel", () => {
  it("renders the page for a signed-in admin", () => {
    const store = storeWith({
      auth: { token: "t", user: { id: 1, role: ROLE_ADMIN }, loading: false, error: "", sessionNotice: "" },
    });

    renderGuard(<ProtectedRoute allow={[ROLE_ADMIN]}>{protectedContent}</ProtectedRoute>, { store });

    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });

  it("sends a signed-out visitor to the admin login", () => {
    const store = storeWith({
      auth: { token: null, user: null, loading: false, error: "", sessionNotice: "" },
    });

    renderGuard(<ProtectedRoute allow={[ROLE_ADMIN]}>{protectedContent}</ProtectedRoute>, { store });

    expect(screen.getByText("Admin login")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("bounces a sub-admin off an admin page to their own dashboard", () => {
    const store = storeWith({
      auth: { token: "t", user: { id: 1, role: ROLE_SUB_ADMIN }, loading: false, error: "", sessionNotice: "" },
    });

    renderGuard(<ProtectedRoute allow={[ROLE_ADMIN]}>{protectedContent}</ProtectedRoute>, { store });

    expect(screen.getByText("Sub-admin dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("bounces an admin off a sub-admin-only page", () => {
    const store = storeWith({
      auth: { token: "t", user: { id: 1, role: ROLE_ADMIN }, loading: false, error: "", sessionNotice: "" },
    });

    renderGuard(<ProtectedRoute allow={[ROLE_SUB_ADMIN]}>{protectedContent}</ProtectedRoute>, {
      store,
      at: "/sub-admin",
    });

    expect(screen.getByText("Admin dashboard")).toBeInTheDocument();
  });

  it("does not bounce a session whose role has not loaded yet", () => {
    // A token saved before roles existed: the profile fetch fills the role in
    // a moment later, and bouncing on the gap would eject a valid session.
    const store = storeWith({
      auth: { token: "t", user: { id: 1 }, loading: false, error: "", sessionNotice: "" },
    });

    renderGuard(<ProtectedRoute allow={[ROLE_ADMIN]}>{protectedContent}</ProtectedRoute>, { store });

    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });

  it("defaults to admin-only when no allow list is given", () => {
    const store = storeWith({
      auth: { token: "t", user: { id: 1, role: ROLE_SUB_ADMIN }, loading: false, error: "", sessionNotice: "" },
    });

    renderGuard(<ProtectedRoute>{protectedContent}</ProtectedRoute>, { store });

    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });
});

describe("homePathForRole", () => {
  it("sends each panel role to its own dashboard", () => {
    expect(homePathForRole(ROLE_ADMIN)).toBe("/dashboard");
    expect(homePathForRole(ROLE_SUB_ADMIN)).toBe("/sub-admin");
    // Anything unexpected lands on the admin dashboard, where the API will
    // then refuse it - a safe default rather than a blank screen.
    expect(homePathForRole(undefined)).toBe("/dashboard");
  });
});

describe("EmployeeProtectedRoute", () => {
  function employeeStore(employee, token = "t") {
    return storeWith({
      employeeAuth: { token, employee, loading: false, error: "", sessionNotice: "" },
    });
  }

  it("renders the portal for a signed-in employee", () => {
    const store = employeeStore({ id: 1, mustChangePassword: false });

    renderGuard(<EmployeeProtectedRoute>{protectedContent}</EmployeeProtectedRoute>, {
      store,
      at: "/employee/portal",
    });

    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });

  it("sends a signed-out visitor to the employee login", () => {
    const store = employeeStore(null, null);

    renderGuard(<EmployeeProtectedRoute>{protectedContent}</EmployeeProtectedRoute>, {
      store,
      at: "/employee/portal",
    });

    expect(screen.getByText("Employee login")).toBeInTheDocument();
  });

  it("pins an employee on a temporary password to their profile", () => {
    const store = employeeStore({ id: 1, mustChangePassword: true });

    renderGuard(<EmployeeProtectedRoute>{protectedContent}</EmployeeProtectedRoute>, {
      store,
      at: "/employee/portal",
    });

    expect(screen.getByText("Employee profile")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("lets them reach the profile itself, or they could never change it", () => {
    const store = employeeStore({ id: 1, mustChangePassword: true });

    renderGuard(<EmployeeProtectedRoute>{protectedContent}</EmployeeProtectedRoute>, {
      store,
      at: "/employee/profile",
    });

    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });
});

describe("UserProtectedRoute", () => {
  it("renders the portal for a signed-in customer", () => {
    const store = storeWith({
      userAuth: { token: "t", user: { id: 1 }, loading: false, error: "", sessionNotice: "" },
    });

    renderGuard(<UserProtectedRoute>{protectedContent}</UserProtectedRoute>, {
      store,
      at: "/user/portal",
    });

    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });

  it("sends a signed-out visitor to the user login", () => {
    const store = storeWith({
      userAuth: { token: null, user: null, loading: false, error: "", sessionNotice: "" },
    });

    renderGuard(<UserProtectedRoute>{protectedContent}</UserProtectedRoute>, {
      store,
      at: "/user/portal",
    });

    expect(screen.getByText("User login")).toBeInTheDocument();
  });
});
