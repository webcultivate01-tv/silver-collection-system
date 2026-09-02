// Admin-side employee management state.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api, { apiErrorMessage } from "../api/axios.js";

// Field-level errors come back as { errors: { mobile: "..." } } from the API.
function rejectValue(error, fallback) {
  return {
    message: apiErrorMessage(error, fallback),
    fieldErrors: error.response?.data?.errors || {},
  };
}

// Registering/editing an employee also uploads their documents, so everything
// goes up as multipart form-data. File fields hold a File (or null when the
// admin didn't pick a new one) and are simply skipped if empty.
function toFormData(values) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === "") continue;
    formData.append(key, value);
  }

  return formData;
}

const MULTIPART = { headers: { "Content-Type": "multipart/form-data" } };

export const fetchEmployees = createAsyncThunk(
  "employees/fetchAll",
  async ({ search = "", status = "all" } = {}, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/employees", { params: { search, status } });
      return data;
    } catch (error) {
      return rejectWithValue(rejectValue(error, "Could not load employees"));
    }
  }
);

export const fetchEmployee = createAsyncThunk(
  "employees/fetchOne",
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`/employees/${id}`);
      return data.employee;
    } catch (error) {
      return rejectWithValue(rejectValue(error, "Could not load this employee"));
    }
  }
);

export const createEmployee = createAsyncThunk(
  "employees/create",
  async (payload, { rejectWithValue }) => {
    try {
      const { data } = await api.post("/employees", toFormData(payload), MULTIPART);
      return data.employee;
    } catch (error) {
      return rejectWithValue(rejectValue(error, "Could not register this employee"));
    }
  }
);

export const updateEmployee = createAsyncThunk(
  "employees/update",
  async ({ id, ...payload }, { rejectWithValue }) => {
    try {
      const { data } = await api.put(`/employees/${id}`, toFormData(payload), MULTIPART);
      return data.employee;
    } catch (error) {
      return rejectWithValue(rejectValue(error, "Could not update this employee"));
    }
  }
);

export const deleteEmployee = createAsyncThunk(
  "employees/delete",
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await api.delete(`/employees/${id}`);
      return { id: Number(id), message: data.message };
    } catch (error) {
      return rejectWithValue(rejectValue(error, "Could not delete this employee"));
    }
  }
);

export const resetEmployeePassword = createAsyncThunk(
  "employees/resetPassword",
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await api.put(`/employees/${id}/reset-password`);
      return data;
    } catch (error) {
      return rejectWithValue(rejectValue(error, "Could not reset the password"));
    }
  }
);

export const toggleEmployeeBlock = createAsyncThunk(
  "employees/toggleBlock",
  async ({ id, blocked }, { rejectWithValue }) => {
    try {
      const { data } = await api.put(`/employees/${id}/block`, { blocked });
      return data;
    } catch (error) {
      return rejectWithValue(rejectValue(error, "Could not update the employee's status"));
    }
  }
);

const initialState = {
  list: [],
  counts: { total: 0, active: 0, blocked: 0 },
  selected: null,
  loading: false,
  saving: false,
  error: "",
  fieldErrors: {},
  // Temp password shown once after a register or a reset.
  issuedPassword: null,
};

const employeesSlice = createSlice({
  name: "employees",
  initialState,
  reducers: {
    clearEmployeeErrors(state) {
      state.error = "";
      state.fieldErrors = {};
    },
    clearIssuedPassword(state) {
      state.issuedPassword = null;
    },
    clearSelectedEmployee(state) {
      state.selected = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchEmployees.pending, (state) => {
        state.loading = true;
        state.error = "";
      })
      .addCase(fetchEmployees.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload.employees;
        state.counts = action.payload.counts;
      })
      .addCase(fetchEmployees.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload.message;
      })

      .addCase(fetchEmployee.pending, (state) => {
        state.loading = true;
        state.error = "";
      })
      .addCase(fetchEmployee.fulfilled, (state, action) => {
        state.loading = false;
        state.selected = action.payload;
      })
      .addCase(fetchEmployee.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload.message;
      })

      .addCase(createEmployee.pending, (state) => {
        state.saving = true;
        state.error = "";
        state.fieldErrors = {};
      })
      .addCase(createEmployee.fulfilled, (state, action) => {
        state.saving = false;
        state.selected = action.payload;
      })
      .addCase(createEmployee.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload.message;
        state.fieldErrors = action.payload.fieldErrors;
      })

      .addCase(updateEmployee.pending, (state) => {
        state.saving = true;
        state.error = "";
        state.fieldErrors = {};
      })
      .addCase(updateEmployee.fulfilled, (state, action) => {
        state.saving = false;
        state.selected = action.payload;
      })
      .addCase(updateEmployee.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload.message;
        state.fieldErrors = action.payload.fieldErrors;
      })

      .addCase(resetEmployeePassword.pending, (state) => {
        state.saving = true;
        state.error = "";
      })
      .addCase(resetEmployeePassword.fulfilled, (state, action) => {
        state.saving = false;
        state.selected = action.payload.employee;
        state.issuedPassword = action.payload.tempPassword;
      })
      .addCase(resetEmployeePassword.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload.message;
      })

      .addCase(toggleEmployeeBlock.pending, (state) => {
        state.saving = true;
        state.error = "";
      })
      .addCase(toggleEmployeeBlock.fulfilled, (state, action) => {
        const updated = action.payload.employee;
        state.saving = false;
        state.selected = updated;

        // The list page blocks people inline, so keep its row and the
        // active/blocked counters in step without a refetch.
        const row = state.list.find((employee) => employee.id === updated.id);
        if (row) {
          const wasBlocked = !!row.is_blocked;
          row.is_blocked = updated.is_blocked;
          row.blocked_at = updated.blocked_at;

          if (wasBlocked !== !!updated.is_blocked) {
            state.counts.blocked += updated.is_blocked ? 1 : -1;
            state.counts.active += updated.is_blocked ? -1 : 1;
          }
        }
      })
      .addCase(toggleEmployeeBlock.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload.message;
      })

      .addCase(deleteEmployee.pending, (state) => {
        state.saving = true;
        state.error = "";
      })
      .addCase(deleteEmployee.fulfilled, (state, action) => {
        state.saving = false;

        const removed = state.list.find((employee) => employee.id === action.payload.id);
        state.list = state.list.filter((employee) => employee.id !== action.payload.id);

        if (removed) {
          state.counts.total = Math.max(0, state.counts.total - 1);
          if (removed.is_blocked) state.counts.blocked = Math.max(0, state.counts.blocked - 1);
          else state.counts.active = Math.max(0, state.counts.active - 1);
        }

        if (state.selected?.id === action.payload.id) state.selected = null;
      })
      .addCase(deleteEmployee.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload.message;
      });
  },
});

export const { clearEmployeeErrors, clearIssuedPassword, clearSelectedEmployee } =
  employeesSlice.actions;

export default employeesSlice.reducer;
