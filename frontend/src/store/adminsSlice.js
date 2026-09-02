// Admin Management state (main admin only): the admin + sub-admin accounts.
// Every request here goes to /api/admins, which the server closes to sub-admins.
//
// The two kinds of account come from two different tables, so their ids start
// at 1 independently and the same id can appear twice in this one list. Rows
// are therefore matched on `account.key` ("admin-1", "subadmin-1"), which the
// server sends alongside the id. The id is still what the API routes take,
// because every one of them only ever acts on a sub-admin.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api, { apiErrorMessage } from "../api/axios.js";

// Field-level errors come back as { errors: { email: "..." } } from the API.
function rejectValue(error, fallback) {
  return {
    message: apiErrorMessage(error, fallback),
    fieldErrors: error.response?.data?.errors || {},
  };
}

export const fetchAdmins = createAsyncThunk(
  "admins/fetchAll",
  async ({ search = "", status = "all" } = {}, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/admins", { params: { search, status } });
      return data;
    } catch (error) {
      return rejectWithValue(rejectValue(error, "Could not load the admin accounts"));
    }
  }
);

export const createSubAdmin = createAsyncThunk(
  "admins/create",
  async (payload, { rejectWithValue }) => {
    try {
      const { data } = await api.post("/admins", payload);
      return data;
    } catch (error) {
      return rejectWithValue(rejectValue(error, "Could not create this sub-admin"));
    }
  }
);

export const updateSubAdmin = createAsyncThunk(
  "admins/update",
  async ({ id, ...payload }, { rejectWithValue }) => {
    try {
      const { data } = await api.put(`/admins/${id}`, payload);
      return data;
    } catch (error) {
      return rejectWithValue(rejectValue(error, "Could not update this sub-admin"));
    }
  }
);

export const setSubAdminStatus = createAsyncThunk(
  "admins/setStatus",
  async ({ id, active }, { rejectWithValue }) => {
    try {
      const { data } = await api.put(`/admins/${id}/status`, { active });
      return data;
    } catch (error) {
      return rejectWithValue(rejectValue(error, "Could not update this sub-admin's status"));
    }
  }
);

export const deleteSubAdmin = createAsyncThunk(
  "admins/delete",
  async ({ id, key }, { rejectWithValue }) => {
    try {
      const { data } = await api.delete(`/admins/${id}`);
      // `key` ("subadmin-3") is what identifies the row in the list: ids
      // restart at 1 in each account table, so admin #1 and sub-admin #1 both
      // exist and an id alone would match the wrong row.
      return { key, message: data.message };
    } catch (error) {
      return rejectWithValue(rejectValue(error, "Could not delete this sub-admin"));
    }
  }
);

const initialCounts = { admins: 0, subAdmins: 0, activeSubAdmins: 0, inactiveSubAdmins: 0 };

// Keeps the counters right after an inline activate/deactivate.
function applyStatusToCounts(counts, wasActive, isActive) {
  if (wasActive === isActive) return;
  counts.activeSubAdmins += isActive ? 1 : -1;
  counts.inactiveSubAdmins += isActive ? -1 : 1;
}

const adminsSlice = createSlice({
  name: "admins",
  initialState: {
    list: [],
    counts: { ...initialCounts },
    currentAdminId: null,
    loading: false,
    saving: false,
    error: "",
    fieldErrors: {},
    notice: "",
  },
  reducers: {
    clearAdminErrors(state) {
      state.error = "";
      state.fieldErrors = {};
    },
    clearAdminNotice(state) {
      state.notice = "";
    },
  },
  extraReducers: (builder) => {
    // Rows are matched on `key` ("subadmin-3"), never on `id` alone - each
    // account table numbers its rows from 1, so ids repeat across them.
    const replaceRow = (state, account) => {
      const index = state.list.findIndex((row) => row.key === account.key);
      if (index !== -1) state.list[index] = account;
    };

    builder
      .addCase(fetchAdmins.pending, (state) => {
        state.loading = true;
        state.error = "";
      })
      .addCase(fetchAdmins.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload.accounts;
        state.counts = action.payload.counts;
        state.currentAdminId = action.payload.currentAdminId;
      })
      .addCase(fetchAdmins.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload.message;
      })

      .addCase(createSubAdmin.pending, (state) => {
        state.saving = true;
        state.error = "";
        state.fieldErrors = {};
      })
      .addCase(createSubAdmin.fulfilled, (state, action) => {
        state.saving = false;
        state.notice = action.payload.message;
        state.list.push(action.payload.account);
        state.counts.subAdmins += 1;
        state.counts.activeSubAdmins += 1;
      })
      .addCase(createSubAdmin.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload.message;
        state.fieldErrors = action.payload.fieldErrors;
      })

      .addCase(updateSubAdmin.pending, (state) => {
        state.saving = true;
        state.error = "";
        state.fieldErrors = {};
      })
      .addCase(updateSubAdmin.fulfilled, (state, action) => {
        state.saving = false;
        state.notice = action.payload.message;
        replaceRow(state, action.payload.account);
      })
      .addCase(updateSubAdmin.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload.message;
        state.fieldErrors = action.payload.fieldErrors;
      })

      .addCase(setSubAdminStatus.pending, (state) => {
        state.saving = true;
        state.error = "";
      })
      .addCase(setSubAdminStatus.fulfilled, (state, action) => {
        const account = action.payload.account;
        const previous = state.list.find((row) => row.key === account.key);

        state.saving = false;
        state.notice = action.payload.message;
        if (previous) applyStatusToCounts(state.counts, previous.isActive, account.isActive);
        replaceRow(state, account);
      })
      .addCase(setSubAdminStatus.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload.message;
      })

      .addCase(deleteSubAdmin.pending, (state) => {
        state.saving = true;
        state.error = "";
      })
      .addCase(deleteSubAdmin.fulfilled, (state, action) => {
        const removed = state.list.find((row) => row.key === action.payload.key);

        state.saving = false;
        state.notice = action.payload.message;
        state.list = state.list.filter((row) => row.key !== action.payload.key);

        if (removed) {
          state.counts.subAdmins = Math.max(0, state.counts.subAdmins - 1);
          if (removed.isActive) {
            state.counts.activeSubAdmins = Math.max(0, state.counts.activeSubAdmins - 1);
          } else {
            state.counts.inactiveSubAdmins = Math.max(0, state.counts.inactiveSubAdmins - 1);
          }
        }
      })
      .addCase(deleteSubAdmin.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload.message;
      });
  },
});

export const { clearAdminErrors, clearAdminNotice } = adminsSlice.actions;

export default adminsSlice.reducer;
