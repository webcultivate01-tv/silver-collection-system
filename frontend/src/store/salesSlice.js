// The sell-back ledger, from three ends: the employee recording a sale at the
// counter, the admin approving the payout, and the customer looking at what
// they've cashed out.
//
// /api/sales doesn't start with /employee, so the axios interceptor would
// reach for the admin token by default - every call here says which session it
// belongs to with `authRole`.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api, { apiErrorMessage } from "../api/axios.js";
import { fetchCustomerHolding } from "./purchasesSlice.js";

const AS_EMPLOYEE = { authRole: "employee" };
const AS_USER = { authRole: "user" };

export const fetchSaleRate = createAsyncThunk(
  "sales/rate",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/sales/rate", AS_EMPLOYEE);
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load today's selling rate"));
    }
  }
);

export const recordSale = createAsyncThunk(
  "sales/record",
  async ({ userId, grams, amountPayable }, { dispatch, rejectWithValue }) => {
    try {
      const body = amountPayable ? { userId, amountPayable } : { userId, grams };
      const { data } = await api.post("/sales", body, AS_EMPLOYEE);
      // The counter list just changed, and so did what this customer holds -
      // the holding lives in purchasesSlice, so refresh it there rather than
      // keeping a second copy of the same number here.
      dispatch(fetchMyRecordedSales());
      dispatch(fetchCustomerHolding(userId));
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not record this sale"));
    }
  }
);

export const fetchMyRecordedSales = createAsyncThunk(
  "sales/recordedByMe",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/sales/recorded-by-me", AS_EMPLOYEE);
      return data.sales;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load your recorded sales"));
    }
  }
);

// The admin panel: every sale, and the payout queue behind it. No `authRole`
// needed - /sales isn't under /employee, so the interceptor reaches for the
// admin token by default.
export const fetchAllSales = createAsyncThunk(
  "sales/all",
  async ({ search = "", status = "", from = "", to = "", limit = 200 } = {}, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/sales", { params: { search, status, from, to, limit } });
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load the sell-back ledger"));
    }
  }
);

export const approveSale = createAsyncThunk(
  "sales/approve",
  async ({ id, filters } = {}, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post(`/sales/${id}/approve`);
      // Re-read rather than patching the row in place, so the totals on screen
      // move with it.
      dispatch(fetchAllSales(filters || {}));
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not approve this payout"));
    }
  }
);

export const fetchMySales = createAsyncThunk(
  "sales/mine",
  async ({ limit } = {}, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/sales/my-sales", {
        ...AS_USER,
        params: limit ? { limit } : undefined,
      });
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load your sales") );
    }
  }
);

const salesSlice = createSlice({
  name: "sales",
  initialState: {
    // Counter
    ratePerGram: null,
    rateIsToday: false,
    recorded: [],
    saving: false,
    lastRecorded: null,

    // Admin panel: the payout queue
    all: [],
    allTotals: null,
    allLoading: false,
    approvingId: null,
    approvedMessage: "",

    // Customer's own view
    mine: [],
    loading: false,

    error: "",
  },
  reducers: {
    clearSaleError(state) {
      state.error = "";
    },
    clearLastSale(state) {
      state.lastRecorded = null;
      state.error = "";
    },
    clearApprovedMessage(state) {
      state.approvedMessage = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSaleRate.fulfilled, (state, action) => {
        state.ratePerGram = action.payload.ratePerGram;
        state.rateIsToday = action.payload.isToday;
      })
      .addCase(fetchSaleRate.rejected, (state, action) => {
        state.error = action.payload;
      })

      .addCase(recordSale.pending, (state) => {
        state.saving = true;
        state.error = "";
        state.lastRecorded = null;
      })
      .addCase(recordSale.fulfilled, (state, action) => {
        state.saving = false;
        state.lastRecorded = action.payload.sale;
      })
      .addCase(recordSale.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload;
      })

      .addCase(fetchMyRecordedSales.fulfilled, (state, action) => {
        state.recorded = action.payload;
      })

      .addCase(fetchAllSales.pending, (state) => {
        state.allLoading = true;
        state.error = "";
      })
      .addCase(fetchAllSales.fulfilled, (state, action) => {
        state.allLoading = false;
        state.all = action.payload.sales;
        state.allTotals = action.payload.totals;
      })
      .addCase(fetchAllSales.rejected, (state, action) => {
        state.allLoading = false;
        state.error = action.payload;
      })

      .addCase(approveSale.pending, (state, action) => {
        state.approvingId = action.meta.arg.id;
        state.error = "";
        state.approvedMessage = "";
      })
      .addCase(approveSale.fulfilled, (state, action) => {
        state.approvingId = null;
        state.approvedMessage = action.payload.message;
      })
      .addCase(approveSale.rejected, (state, action) => {
        state.approvingId = null;
        state.error = action.payload;
      })

      .addCase(fetchMySales.pending, (state) => {
        state.loading = true;
        state.error = "";
      })
      .addCase(fetchMySales.fulfilled, (state, action) => {
        state.loading = false;
        state.mine = action.payload.sales;
      })
      .addCase(fetchMySales.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearSaleError, clearLastSale, clearApprovedMessage } = salesSlice.actions;

export default salesSlice.reducer;
