// Employee Collections: the admin picking an employee and reading back
// everything that employee has collected, and from which client.
//
// It also backs the employee's own Monthly Collection screen, which reads the
// same rows for whoever is signed in at the counter.
//
// Read-only - there is no thunk here that writes. The admin calls need no
// `authRole`: /collections isn't under /employee, so the interceptor reaches
// for the admin token by default. The employee's own calls have to say so.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api, { apiErrorMessage } from "../api/axios.js";

// The picker: every employee with their running collection total.
export const fetchCollectionEmployees = createAsyncThunk(
  "collections/employees",
  async ({ search = "", status = "all" } = {}, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/collections/employees", { params: { search, status } });
      return data.employees;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load the employee list"));
    }
  }
);

// One employee's collections: totals, the per-client roll-up and every row.
export const fetchEmployeeCollections = createAsyncThunk(
  "collections/detail",
  async ({ employeeId, from = "", to = "", status = "all", search = "" }, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`/collections/employees/${employeeId}`, {
        params: { from, to, status, search },
      });
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load this employee's collections"));
    }
  }
);

// ---------------------------------------------------------------------------
// The employee's own side. Same rows, read for whoever is signed in - the API
// takes the employee off the token, so nothing here passes an id.
// ---------------------------------------------------------------------------

const AS_EMPLOYEE = { authRole: "employee" };

// The "Total collected" card on the employee dashboard.
export const fetchMyCollectionTotals = createAsyncThunk(
  "collections/myTotals",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/collections/me", AS_EMPLOYEE);
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load your collection total"));
    }
  }
);

// The Monthly Collection screen: one year, month by month.
export const fetchMyMonthlyCollections = createAsyncThunk(
  "collections/myMonthly",
  async ({ year = "" } = {}, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/collections/me/monthly", {
        ...AS_EMPLOYEE,
        params: { year },
      });
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load your monthly collections"));
    }
  }
);

// One month opened up: every payment in it, and the clients behind them.
export const fetchMyMonthCollections = createAsyncThunk(
  "collections/myMonth",
  async (month, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`/collections/me/months/${month}`, AS_EMPLOYEE);
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load that month's collections"));
    }
  }
);

const collectionsSlice = createSlice({
  name: "collections",
  initialState: {
    employees: [],
    employeesLoading: false,

    // The employee currently open, and what they collected.
    employee: null,
    summary: null,
    clients: [],
    collections: [],
    // The filters the API applied, echoed back - its limit is what tells the
    // table whether it is showing everything or only the newest rows.
    appliedFilters: null,
    detailLoading: false,

    // The employee's own side. Kept apart from the admin's fields above so a
    // stale error or total from one panel can never surface on the other.
    myTotals: null,
    myTotalsLoading: false,
    monthly: null,
    monthlyLoading: false,
    monthDetail: null,
    monthDetailLoading: false,
    myError: "",

    error: "",
  },
  reducers: {
    clearCollectionsError(state) {
      state.error = "";
    },
    clearMyCollectionsError(state) {
      state.myError = "";
    },
    // Closing the expanded month on the employee screen.
    clearMonthDetail(state) {
      state.monthDetail = null;
    },
    // Clearing the selection also clears what was shown for it, so one
    // employee's collections can never linger under another's name.
    clearSelectedCollections(state) {
      state.employee = null;
      state.summary = null;
      state.clients = [];
      state.collections = [];
      state.appliedFilters = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCollectionEmployees.pending, (state) => {
        state.employeesLoading = true;
        state.error = "";
      })
      .addCase(fetchCollectionEmployees.fulfilled, (state, action) => {
        state.employeesLoading = false;
        state.employees = action.payload;
      })
      .addCase(fetchCollectionEmployees.rejected, (state, action) => {
        state.employeesLoading = false;
        state.error = action.payload;
      })

      .addCase(fetchEmployeeCollections.pending, (state) => {
        state.detailLoading = true;
        state.error = "";
      })
      .addCase(fetchEmployeeCollections.fulfilled, (state, action) => {
        state.detailLoading = false;
        state.employee = action.payload.employee;
        state.summary = action.payload.summary;
        state.clients = action.payload.clients;
        state.collections = action.payload.collections;
        state.appliedFilters = action.payload.filters;
      })
      .addCase(fetchEmployeeCollections.rejected, (state, action) => {
        state.detailLoading = false;
        state.error = action.payload;
      })

      .addCase(fetchMyCollectionTotals.pending, (state) => {
        state.myTotalsLoading = true;
      })
      .addCase(fetchMyCollectionTotals.fulfilled, (state, action) => {
        state.myTotalsLoading = false;
        state.myTotals = action.payload;
      })
      .addCase(fetchMyCollectionTotals.rejected, (state, action) => {
        state.myTotalsLoading = false;
        state.myError = action.payload;
      })

      .addCase(fetchMyMonthlyCollections.pending, (state) => {
        state.monthlyLoading = true;
        state.myError = "";
      })
      .addCase(fetchMyMonthlyCollections.fulfilled, (state, action) => {
        state.monthlyLoading = false;
        state.monthly = action.payload;
      })
      .addCase(fetchMyMonthlyCollections.rejected, (state, action) => {
        state.monthlyLoading = false;
        state.myError = action.payload;
      })

      .addCase(fetchMyMonthCollections.pending, (state) => {
        state.monthDetailLoading = true;
        state.myError = "";
      })
      .addCase(fetchMyMonthCollections.fulfilled, (state, action) => {
        state.monthDetailLoading = false;
        state.monthDetail = action.payload;
      })
      .addCase(fetchMyMonthCollections.rejected, (state, action) => {
        state.monthDetailLoading = false;
        state.monthDetail = null;
        state.myError = action.payload;
      });
  },
});

export const {
  clearCollectionsError,
  clearMyCollectionsError,
  clearMonthDetail,
  clearSelectedCollections,
} = collectionsSlice.actions;

export default collectionsSlice.reducer;
