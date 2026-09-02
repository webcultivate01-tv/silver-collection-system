// The admin-panel session.
//
// The behaviour worth pinning is what happens when a session ends: the token
// has to be cleared and a reason kept, or the app sits on a dashboard it can
// no longer load any data for.

import { describe, it, expect, beforeEach } from "vitest";

import reducer, {
  logout,
  setUser,
  clearAuthError,
  clearSessionNotice,
  loginAdmin,
  fetchAdminProfile,
  selectIsMainAdmin,
  selectIsSubAdmin,
  selectCanDownloadDocuments,
  selectAdminHomePath,
  ROLE_ADMIN,
  ROLE_SUB_ADMIN,
} from "../store/authSlice.js";
import { ADMIN_TOKEN_KEY } from "../api/axios.js";

const initial = { token: null, user: null, loading: false, error: "", sessionNotice: "" };

beforeEach(() => {
  localStorage.clear();
});

describe("signing in", () => {
  it("stores the token and the account, in state and in storage", () => {
    const user = { id: 1, name: "Admin", email: "a@test.local", role: ROLE_ADMIN };
    const state = reducer(initial, {
      type: loginAdmin.fulfilled.type,
      payload: { token: "jwt-token", user },
    });

    expect(state.token).toBe("jwt-token");
    expect(state.user).toEqual(user);
    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBe("jwt-token");
    expect(JSON.parse(localStorage.getItem("user"))).toEqual(user);
  });

  it("shows a spinner and clears any previous error while pending", () => {
    const state = reducer(
      { ...initial, error: "Invalid email or password", sessionNotice: "Deactivated" },
      { type: loginAdmin.pending.type }
    );

    expect(state.loading).toBe(true);
    expect(state.error).toBe("");
    expect(state.sessionNotice).toBe("");
  });

  it("keeps the failure message for the form, and stays signed out", () => {
    const state = reducer(
      { ...initial, loading: true },
      { type: loginAdmin.rejected.type, payload: "Invalid email or password" }
    );

    expect(state.loading).toBe(false);
    expect(state.error).toBe("Invalid email or password");
    expect(state.token).toBeNull();
    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBeNull();
  });
});

describe("the session ending", () => {
  const signedIn = {
    ...initial,
    token: "jwt-token",
    user: { id: 1, role: ROLE_SUB_ADMIN, name: "Sub" },
  };

  beforeEach(() => {
    localStorage.setItem(ADMIN_TOKEN_KEY, "jwt-token");
    localStorage.setItem("user", JSON.stringify({ id: 1 }));
  });

  it("clears everything on an explicit logout", () => {
    const state = reducer(signedIn, logout());

    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(state.sessionNotice).toBe("");
    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
  });

  it("ends the session when the server refuses the token", () => {
    // The account was deactivated or deleted while the tab was open.
    const state = reducer(signedIn, {
      type: fetchAdminProfile.rejected.type,
      payload: { status: 403, message: "Your account has been deactivated." },
    });

    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    // The reason survives the redirect to the login page, unlike `error`.
    expect(state.sessionNotice).toBe("Your account has been deactivated.");
    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBeNull();
  });

  it("ends the session on a 401 as well as a 403", () => {
    const state = reducer(signedIn, {
      type: fetchAdminProfile.rejected.type,
      payload: { status: 401, message: "Token expired" },
    });

    expect(state.token).toBeNull();
  });

  it("does NOT end the session on a network failure", () => {
    // A dropped connection is not a permission answer. Signing the admin out
    // because their wifi blipped would be its own bug.
    const state = reducer(signedIn, {
      type: fetchAdminProfile.rejected.type,
      payload: { status: 0, message: "Could not load your profile" },
    });

    expect(state.token).toBe("jwt-token");
    expect(state.user).not.toBeNull();
  });

  it("does not end the session on a 500", () => {
    const state = reducer(signedIn, {
      type: fetchAdminProfile.rejected.type,
      payload: { status: 500, message: "Something went wrong" },
    });

    expect(state.token).toBe("jwt-token");
  });
});

describe("keeping the cached account fresh", () => {
  it("replaces the stored account when the profile loads", () => {
    const user = { id: 1, name: "Renamed", role: ROLE_ADMIN };
    const state = reducer(
      { ...initial, token: "t", user: { id: 1, name: "Old", role: ROLE_ADMIN } },
      { type: fetchAdminProfile.fulfilled.type, payload: user }
    );

    expect(state.user).toEqual(user);
    expect(JSON.parse(localStorage.getItem("user"))).toEqual(user);
  });

  it("writes through to storage on setUser, so a refresh keeps the change", () => {
    const user = { id: 1, name: "Edited", role: ROLE_ADMIN };
    const state = reducer({ ...initial, token: "t" }, setUser(user));

    expect(state.user).toEqual(user);
    expect(JSON.parse(localStorage.getItem("user"))).toEqual(user);
  });

  it("clears the two message fields independently", () => {
    const withBoth = { ...initial, error: "e", sessionNotice: "n" };

    expect(reducer(withBoth, clearAuthError()).sessionNotice).toBe("n");
    expect(reducer(withBoth, clearAuthError()).error).toBe("");
    expect(reducer(withBoth, clearSessionNotice()).error).toBe("e");
    expect(reducer(withBoth, clearSessionNotice()).sessionNotice).toBe("");
  });
});

describe("selectors", () => {
  const stateFor = (role) => ({ auth: { ...initial, token: "t", user: role ? { id: 1, role } : null } });

  it("tells the two panel roles apart", () => {
    expect(selectIsMainAdmin(stateFor(ROLE_ADMIN))).toBe(true);
    expect(selectIsSubAdmin(stateFor(ROLE_ADMIN))).toBe(false);
    expect(selectIsSubAdmin(stateFor(ROLE_SUB_ADMIN))).toBe(true);
    expect(selectIsMainAdmin(stateFor(ROLE_SUB_ADMIN))).toBe(false);
  });

  it("allows document downloads for both panel roles and nobody else", () => {
    // Saving somebody's Aadhaar scan off the screen is a panel power; an
    // employee and the customer themselves can view but not take a copy.
    expect(selectCanDownloadDocuments(stateFor(ROLE_ADMIN))).toBe(true);
    expect(selectCanDownloadDocuments(stateFor(ROLE_SUB_ADMIN))).toBe(true);
    expect(selectCanDownloadDocuments(stateFor("employee"))).toBe(false);
    expect(selectCanDownloadDocuments(stateFor("user"))).toBe(false);
    expect(selectCanDownloadDocuments(stateFor(null))).toBe(false);
  });

  it("points each role at its own home", () => {
    expect(selectAdminHomePath(stateFor(ROLE_ADMIN))).toBe("/dashboard");
    expect(selectAdminHomePath(stateFor(ROLE_SUB_ADMIN))).toBe("/sub-admin");
  });
});
