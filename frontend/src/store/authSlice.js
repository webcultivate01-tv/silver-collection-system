// Admin-panel session state, shared by the main admin and sub-admins.
//
// Both sign in at /admin. What comes back from the API says which one it is
// (`user.role` is "admin" or "subadmin") and everything downstream - the
// routes, the layout, the sidebar - keys off that.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api, { ADMIN_TOKEN_KEY, apiErrorMessage } from "../api/axios.js";

const USER_KEY = "user";

export const ROLE_ADMIN = "admin";
export const ROLE_SUB_ADMIN = "subadmin";

// Where a signed-in account belongs after login, or after being bounced off a
// page it isn't allowed to open.
export function homePathForRole(role) {
  return role === ROLE_SUB_ADMIN ? "/sub-admin" : "/dashboard";
}

function readStoredUser() {
  const saved = localStorage.getItem(USER_KEY);
  return saved ? JSON.parse(saved) : null;
}

function clearSession(state) {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  state.token = null;
  state.user = null;
}

export const loginAdmin = createAsyncThunk(
  "auth/login",
  async ({ email, password }, { rejectWithValue }) => {
    try {
      // `role: "admin"` names the login page, not the account: the server lets
      // both admins and sub-admins in here and rejects everyone else, so each
      // role still only gets in through its own door.
      const { data } = await api.post("/auth/login", { email, password, role: "admin" });
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Login failed. Please try again."));
    }
  }
);

export const fetchAdminProfile = createAsyncThunk(
  "auth/fetchProfile",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/profile");
      return data.user;
    } catch (error) {
      return rejectWithValue({
        message: apiErrorMessage(error, "Could not load your profile"),
        status: error.response?.status || 0,
      });
    }
  }
);

const authSlice = createSlice({
  name: "auth",
  initialState: {
    token: localStorage.getItem(ADMIN_TOKEN_KEY),
    user: readStoredUser(),
    loading: false,
    error: "",
    // Why the session ended (e.g. the account was deactivated). Survives the
    // redirect to the login page, unlike `error`.
    sessionNotice: "",
  },
  reducers: {
    logout(state) {
      clearSession(state);
      state.error = "";
      state.sessionNotice = "";
    },
    setUser(state, action) {
      state.user = action.payload;
      localStorage.setItem(USER_KEY, JSON.stringify(action.payload));
    },
    clearAuthError(state) {
      state.error = "";
    },
    clearSessionNotice(state) {
      state.sessionNotice = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginAdmin.pending, (state) => {
        state.loading = true;
        state.error = "";
        state.sessionNotice = "";
      })
      .addCase(loginAdmin.fulfilled, (state, action) => {
        state.loading = false;
        state.token = action.payload.token;
        state.user = action.payload.user;
        localStorage.setItem(ADMIN_TOKEN_KEY, action.payload.token);
        localStorage.setItem(USER_KEY, JSON.stringify(action.payload.user));
      })
      .addCase(loginAdmin.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchAdminProfile.fulfilled, (state, action) => {
        state.user = action.payload;
        localStorage.setItem(USER_KEY, JSON.stringify(action.payload));
      })
      .addCase(fetchAdminProfile.rejected, (state, action) => {
        // The server refused the token - the account was deactivated, deleted
        // or the token expired. End the session here so the app doesn't sit on
        // a dashboard it can no longer load data for.
        if ([401, 403].includes(action.payload?.status)) {
          clearSession(state);
          state.sessionNotice = action.payload.message;
        }
      });
  },
});

export const { logout, setUser, clearAuthError, clearSessionNotice } = authSlice.actions;

export const selectAdmin = (state) => state.auth.user;
export const selectIsAdminAuthenticated = (state) => !!state.auth.token;
export const selectAdminRole = (state) => state.auth.user?.role || null;
export const selectIsMainAdmin = (state) => state.auth.user?.role === ROLE_ADMIN;
export const selectIsSubAdmin = (state) => state.auth.user?.role === ROLE_SUB_ADMIN;
export const selectAdminHomePath = (state) => homePathForRole(state.auth.user?.role);

// Saving a copy of somebody's Aadhaar or PAN scan off the screen is an admin
// and sub-admin power: an employee - and the customer themselves - can look at
// a document in the viewer but not take it away. This is what every panel
// passes to <DocumentGallery canDownload>, so they all ask the same question.
export const selectCanDownloadDocuments = (state) =>
  [ROLE_ADMIN, ROLE_SUB_ADMIN].includes(state.auth.user?.role);

export default authSlice.reducer;
