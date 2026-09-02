// The daily cash handover, from both ends: the employee bundling their
// unsettled takings and handing them over, and the admin accepting the cash.
//
// /api/settlements doesn't start with /employee, so every call says which
// session it belongs to with `authRole` - same convention as purchasesSlice.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api, { apiErrorMessage } from "../api/axios.js";

const AS_EMPLOYEE = { authRole: "employee" };

// The counter's own unsettled takings, before they've handed them over.
export const fetchPendingSummary = createAsyncThunk(
  "settlements/pendingSummary",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/settlements/pending-summary", AS_EMPLOYEE);
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load your unsettled collections"));
    }
  }
);

// Bundle everything unsettled into one handover and hand it to the admin.
export const handOverCash = createAsyncThunk(
  "settlements/handOver",
  async (_, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post("/settlements", {}, AS_EMPLOYEE);
      dispatch(fetchPendingSummary());
      dispatch(fetchMySettlements());
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not hand over cash"));
    }
  }
);

export const fetchMySettlements = createAsyncThunk(
  "settlements/mine",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/settlements/mine", AS_EMPLOYEE);
      return data.settlements;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load your handover history"));
    }
  }
);

// The admin panel: every handover, and accepting one. `employeeId` narrows
// it down to one employee's own settlement history.
export const fetchSettlements = createAsyncThunk(
  "settlements/all",
  async ({ status = "all", date = "", from = "", to = "", employeeId = "" } = {}, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/settlements", {
        params: { status, date, from, to, employeeId },
      });
      return data.settlements;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load cash settlements"));
    }
  }
);

export const fetchSettlementDetail = createAsyncThunk(
  "settlements/detail",
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`/settlements/${id}`);
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load this handover"));
    }
  }
);

export const acceptSettlement = createAsyncThunk(
  "settlements/accept",
  async (id, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post(`/settlements/${id}/accept`);
      dispatch(fetchSettlements({}));
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not accept this cash"));
    }
  }
);

const EMPTY_SUMMARY = { count: 0, totalAmount: 0, purchases: [] };

const settlementsSlice = createSlice({
  name: "settlements",
  initialState: {
    // Counter (employee)
    pendingSummary: EMPTY_SUMMARY,
    pendingSummaryLoading: false,
    mine: [],
    handingOver: false,
    lastHandover: null,

    // Admin panel
    all: [],
    allLoading: false,
    selectedDetail: null,
    accepting: false,
    lastAccepted: null,

    error: "",
  },
  reducers: {
    clearSettlementsError(state) {
      state.error = "";
    },
    clearLastHandover(state) {
      state.lastHandover = null;
    },
    clearLastAccepted(state) {
      state.lastAccepted = null;
    },
    clearSelectedSettlement(state) {
      state.selectedDetail = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPendingSummary.pending, (state) => {
        state.pendingSummaryLoading = true;
      })
      .addCase(fetchPendingSummary.fulfilled, (state, action) => {
        state.pendingSummaryLoading = false;
        state.pendingSummary = action.payload;
      })
      .addCase(fetchPendingSummary.rejected, (state, action) => {
        state.pendingSummaryLoading = false;
        state.error = action.payload;
      })

      .addCase(handOverCash.pending, (state) => {
        state.handingOver = true;
        state.error = "";
        state.lastHandover = null;
      })
      .addCase(handOverCash.fulfilled, (state, action) => {
        state.handingOver = false;
        state.lastHandover = action.payload;
      })
      .addCase(handOverCash.rejected, (state, action) => {
        state.handingOver = false;
        state.error = action.payload;
      })

      .addCase(fetchMySettlements.fulfilled, (state, action) => {
        state.mine = action.payload;
      })

      .addCase(fetchSettlements.pending, (state) => {
        state.allLoading = true;
      })
      .addCase(fetchSettlements.fulfilled, (state, action) => {
        state.allLoading = false;
        state.all = action.payload;
      })
      .addCase(fetchSettlements.rejected, (state, action) => {
        state.allLoading = false;
        state.error = action.payload;
      })

      .addCase(fetchSettlementDetail.fulfilled, (state, action) => {
        state.selectedDetail = action.payload;
      })
      .addCase(fetchSettlementDetail.rejected, (state, action) => {
        state.error = action.payload;
      })

      .addCase(acceptSettlement.pending, (state) => {
        state.accepting = true;
        state.error = "";
      })
      .addCase(acceptSettlement.fulfilled, (state, action) => {
        state.accepting = false;
        state.lastAccepted = action.payload;
        if (state.selectedDetail?.settlement?.id === action.payload.settlement.id) {
          state.selectedDetail = {
            ...state.selectedDetail,
            settlement: action.payload.settlement,
          };
        }
      })
      .addCase(acceptSettlement.rejected, (state, action) => {
        state.accepting = false;
        state.error = action.payload;
      });
  },
});

export const {
  clearSettlementsError,
  clearLastHandover,
  clearLastAccepted,
  clearSelectedSettlement,
} = settlementsSlice.actions;

export default settlementsSlice.reducer;
