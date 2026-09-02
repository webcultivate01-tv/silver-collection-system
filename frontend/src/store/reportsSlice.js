// Read-only reporting data behind the sub-admin dashboard.
//
// There is deliberately no thunk in this file that posts, puts or deletes -
// the whole slice can only read from /api/reports, which is a GET-only router.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api, { apiErrorMessage } from "../api/axios.js";

export const fetchReportSummary = createAsyncThunk(
  "reports/summary",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/reports/summary");
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load the dashboard summary"));
    }
  }
);

export const fetchEmployeeReport = createAsyncThunk(
  "reports/employees",
  async ({ search = "", status = "all" } = {}, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/reports/employees", { params: { search, status } });
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load the employee report"));
    }
  }
);

export const fetchSilverRateReport = createAsyncThunk(
  "reports/silverRates",
  async ({ search = "", from = "", to = "", limit = 100 } = {}, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/reports/silver-rates", {
        params: { search, from, to, limit },
      });
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load the silver rate report"));
    }
  }
);

const reportsSlice = createSlice({
  name: "reports",
  initialState: {
    summary: null,
    summaryLoading: false,

    employees: [],
    employeeCounts: { total: 0, active: 0, blocked: 0 },
    employeesLoading: false,

    rates: [],
    ratesLoading: false,

    error: "",
  },
  reducers: {
    clearReportError(state) {
      state.error = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchReportSummary.pending, (state) => {
        state.summaryLoading = true;
        state.error = "";
      })
      .addCase(fetchReportSummary.fulfilled, (state, action) => {
        state.summaryLoading = false;
        state.summary = action.payload;
      })
      .addCase(fetchReportSummary.rejected, (state, action) => {
        state.summaryLoading = false;
        state.error = action.payload;
      })

      .addCase(fetchEmployeeReport.pending, (state) => {
        state.employeesLoading = true;
        state.error = "";
      })
      .addCase(fetchEmployeeReport.fulfilled, (state, action) => {
        state.employeesLoading = false;
        state.employees = action.payload.employees;
        state.employeeCounts = action.payload.counts;
      })
      .addCase(fetchEmployeeReport.rejected, (state, action) => {
        state.employeesLoading = false;
        state.error = action.payload;
      })

      .addCase(fetchSilverRateReport.pending, (state) => {
        state.ratesLoading = true;
        state.error = "";
      })
      .addCase(fetchSilverRateReport.fulfilled, (state, action) => {
        state.ratesLoading = false;
        state.rates = action.payload.rates;
      })
      .addCase(fetchSilverRateReport.rejected, (state, action) => {
        state.ratesLoading = false;
        state.error = action.payload;
      });
  },
});

export const { clearReportError } = reportsSlice.actions;

export default reportsSlice.reducer;
