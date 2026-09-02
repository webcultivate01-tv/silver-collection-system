// The employee portal's User Management state.
//
// Every request goes to /employee/users, so the axios interceptor sends the
// employee's own token (see api/axios.js). The backend then only ever answers
// with users that belong to the signed-in employee.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api, { apiErrorMessage } from "../api/axios.js";

// Field-level errors come back as { errors: { mobile: "..." } } from the API.
function rejectValue(error, fallback) {
  return {
    message: apiErrorMessage(error, fallback),
    fieldErrors: error.response?.data?.errors || {},
  };
}

// Registering/editing a user also uploads their documents, so everything goes
// up as multipart form-data. File fields hold a File (or null when nothing new
// was picked) and empty values are simply skipped.
function toFormData(values) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === "") continue;
    formData.append(key, value);
  }

  return formData;
}

const MULTIPART = { headers: { "Content-Type": "multipart/form-data" } };

// `totalGrams` is the NET holding - bought minus sold back. See
// backend/utils/holding.js.
const EMPTY_HOLDING = {
  purchases: 0,
  totalGrams: 0,
  gramsLabel: "—",
  totalPaid: 0,
  lastPurchaseOn: null,
  boughtGrams: 0,
  boughtGramsLabel: "—",
  sales: 0,
  soldGrams: 0,
  soldGramsLabel: "—",
  totalReceived: 0,
  lastSaleOn: null,
};

export const fetchMyUsers = createAsyncThunk(
  "employeeUsers/fetchAll",
  async ({ search = "", status = "all" } = {}, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/employee/users", { params: { search, status } });
      return data;
    } catch (error) {
      return rejectWithValue(rejectValue(error, "Could not load your users"));
    }
  }
);

export const fetchMyUser = createAsyncThunk(
  "employeeUsers/fetchOne",
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`/employee/users/${id}`);
      return data;
    } catch (error) {
      return rejectWithValue(rejectValue(error, "Could not load this user"));
    }
  }
);

export const createUser = createAsyncThunk(
  "employeeUsers/create",
  async (payload, { rejectWithValue }) => {
    try {
      const { data } = await api.post("/employee/users", toFormData(payload), MULTIPART);
      return data.user;
    } catch (error) {
      return rejectWithValue(rejectValue(error, "Could not register this user"));
    }
  }
);

export const updateUser = createAsyncThunk(
  "employeeUsers/update",
  async ({ id, ...payload }, { rejectWithValue }) => {
    try {
      const { data } = await api.put(`/employee/users/${id}`, toFormData(payload), MULTIPART);
      return data.user;
    } catch (error) {
      return rejectWithValue(rejectValue(error, "Could not update this user"));
    }
  }
);

export const resetUserPassword = createAsyncThunk(
  "employeeUsers/resetPassword",
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await api.put(`/employee/users/${id}/reset-password`);
      return data;
    } catch (error) {
      return rejectWithValue(rejectValue(error, "Could not reset the password"));
    }
  }
);

export const toggleUserStatus = createAsyncThunk(
  "employeeUsers/toggleStatus",
  async ({ id, active }, { rejectWithValue }) => {
    try {
      const { data } = await api.put(`/employee/users/${id}/status`, { active });
      return data;
    } catch (error) {
      return rejectWithValue(rejectValue(error, "Could not update the user's status"));
    }
  }
);

const initialState = {
  list: [],
  counts: { total: 0, active: 0, inactive: 0 },
  selected: null,
  selectedHolding: EMPTY_HOLDING,
  selectedPurchases: [],
  selectedSales: [],
  loading: false,
  saving: false,
  error: "",
  fieldErrors: {},
  // A password shown once after a registration or a reset.
  issuedPassword: null,
};

const employeeUsersSlice = createSlice({
  name: "employeeUsers",
  initialState,
  reducers: {
    clearUserErrors(state) {
      state.error = "";
      state.fieldErrors = {};
    },
    clearIssuedUserPassword(state) {
      state.issuedPassword = null;
    },
    clearSelectedUser(state) {
      state.selected = null;
      state.selectedHolding = EMPTY_HOLDING;
      state.selectedPurchases = [];
      state.selectedSales = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyUsers.pending, (state) => {
        state.loading = true;
        state.error = "";
      })
      .addCase(fetchMyUsers.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload.users;
        state.counts = action.payload.counts;
      })
      .addCase(fetchMyUsers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload.message;
      })

      .addCase(fetchMyUser.pending, (state) => {
        state.loading = true;
        state.error = "";
      })
      .addCase(fetchMyUser.fulfilled, (state, action) => {
        state.loading = false;
        state.selected = action.payload.user;
        state.selectedHolding = action.payload.holding || EMPTY_HOLDING;
        state.selectedPurchases = action.payload.purchases || [];
        state.selectedSales = action.payload.sales || [];
      })
      .addCase(fetchMyUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload.message;
      })

      .addCase(createUser.pending, (state) => {
        state.saving = true;
        state.error = "";
        state.fieldErrors = {};
      })
      .addCase(createUser.fulfilled, (state, action) => {
        state.saving = false;
        state.selected = action.payload;
      })
      .addCase(createUser.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload.message;
        state.fieldErrors = action.payload.fieldErrors;
      })

      .addCase(updateUser.pending, (state) => {
        state.saving = true;
        state.error = "";
        state.fieldErrors = {};
      })
      .addCase(updateUser.fulfilled, (state, action) => {
        state.saving = false;
        state.selected = action.payload;
      })
      .addCase(updateUser.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload.message;
        state.fieldErrors = action.payload.fieldErrors;
      })

      .addCase(resetUserPassword.pending, (state) => {
        state.saving = true;
        state.error = "";
      })
      .addCase(resetUserPassword.fulfilled, (state, action) => {
        state.saving = false;
        state.selected = action.payload.user;
        state.issuedPassword = action.payload.password;
      })
      .addCase(resetUserPassword.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload.message;
      })

      .addCase(toggleUserStatus.pending, (state) => {
        state.saving = true;
        state.error = "";
      })
      .addCase(toggleUserStatus.fulfilled, (state, action) => {
        const updated = action.payload.user;
        state.saving = false;
        state.selected = updated;

        // The list page activates/deactivates inline, so keep its row and the
        // counters in step without a refetch.
        const row = state.list.find((user) => user.id === updated.id);
        if (row) {
          const wasActive = !!row.is_active;
          row.is_active = updated.is_active;

          if (wasActive !== !!updated.is_active) {
            state.counts.active += updated.is_active ? 1 : -1;
            state.counts.inactive += updated.is_active ? -1 : 1;
          }
        }
      })
      .addCase(toggleUserStatus.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload.message;
      });
  },
});

export const { clearUserErrors, clearIssuedUserPassword, clearSelectedUser } =
  employeeUsersSlice.actions;

export default employeeUsersSlice.reducer;
