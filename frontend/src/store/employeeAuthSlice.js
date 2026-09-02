// Employee session state for the portal at /employee.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api, { EMPLOYEE_TOKEN_KEY, apiErrorMessage } from "../api/axios.js";

const EMPLOYEE_KEY = "employee";

function readStoredEmployee() {
  const saved = localStorage.getItem(EMPLOYEE_KEY);
  return saved ? JSON.parse(saved) : null;
}

function persist(employee) {
  localStorage.setItem(EMPLOYEE_KEY, JSON.stringify(employee));
}

export const loginEmployee = createAsyncThunk(
  "employeeAuth/login",
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const { data } = await api.post("/employee/login", { email, password });
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Login failed. Please try again."));
    }
  }
);

export const fetchEmployeeProfile = createAsyncThunk(
  "employeeAuth/fetchProfile",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/employee/me");
      return data.employee;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load your profile"));
    }
  }
);

// The only part of their own record an employee may change.
export const updateEmployeePhoto = createAsyncThunk(
  "employeeAuth/updatePhoto",
  async (file, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      formData.append("profilePhoto", file);

      const { data } = await api.put("/employee/profile-photo", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return data.employee;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not update your photo"));
    }
  }
);

export const changeEmployeePassword = createAsyncThunk(
  "employeeAuth/changePassword",
  async ({ currentPassword, newPassword }, { rejectWithValue }) => {
    try {
      const { data } = await api.put("/employee/change-password", {
        currentPassword,
        newPassword,
      });
      return data.employee;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not change your password"));
    }
  }
);

const employeeAuthSlice = createSlice({
  name: "employeeAuth",
  initialState: {
    token: localStorage.getItem(EMPLOYEE_TOKEN_KEY),
    employee: readStoredEmployee(),
    loading: false,
    error: "",
    passwordChanged: false,
    photoUploading: false,
    photoError: "",
  },
  reducers: {
    employeeLogout(state) {
      localStorage.removeItem(EMPLOYEE_TOKEN_KEY);
      localStorage.removeItem(EMPLOYEE_KEY);
      state.token = null;
      state.employee = null;
      state.error = "";
      state.passwordChanged = false;
      state.photoError = "";
    },
    clearEmployeeAuthError(state) {
      state.error = "";
      state.passwordChanged = false;
      state.photoError = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginEmployee.pending, (state) => {
        state.loading = true;
        state.error = "";
      })
      .addCase(loginEmployee.fulfilled, (state, action) => {
        state.loading = false;
        state.token = action.payload.token;
        state.employee = action.payload.employee;
        localStorage.setItem(EMPLOYEE_TOKEN_KEY, action.payload.token);
        persist(action.payload.employee);
      })
      .addCase(loginEmployee.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchEmployeeProfile.fulfilled, (state, action) => {
        state.employee = action.payload;
        persist(action.payload);
      })
      // An admin block invalidates the token mid-session; drop it so the
      // portal falls back to the login screen instead of showing stale data.
      .addCase(fetchEmployeeProfile.rejected, (state) => {
        localStorage.removeItem(EMPLOYEE_TOKEN_KEY);
        localStorage.removeItem(EMPLOYEE_KEY);
        state.token = null;
        state.employee = null;
      })
      .addCase(updateEmployeePhoto.pending, (state) => {
        state.photoUploading = true;
        state.photoError = "";
      })
      .addCase(updateEmployeePhoto.fulfilled, (state, action) => {
        state.photoUploading = false;
        state.employee = action.payload;
        persist(action.payload);
      })
      .addCase(updateEmployeePhoto.rejected, (state, action) => {
        state.photoUploading = false;
        state.photoError = action.payload;
      })
      .addCase(changeEmployeePassword.pending, (state) => {
        state.loading = true;
        state.error = "";
        state.passwordChanged = false;
      })
      .addCase(changeEmployeePassword.fulfilled, (state, action) => {
        state.loading = false;
        state.employee = action.payload;
        state.passwordChanged = true;
        persist(action.payload);
      })
      .addCase(changeEmployeePassword.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { employeeLogout, clearEmployeeAuthError } = employeeAuthSlice.actions;

export const selectEmployee = (state) => state.employeeAuth.employee;
export const selectIsEmployeeAuthenticated = (state) => !!state.employeeAuth.token;

export default employeeAuthSlice.reducer;
