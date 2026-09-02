// The purchase ledger, from both ends: the employee recording one at the
// counter, and the customer looking at what they hold.
//
// /api/purchases doesn't start with /employee, so the axios interceptor would
// reach for the admin token by default - every call here says which session it
// belongs to with `authRole`.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api, { apiErrorMessage } from "../api/axios.js";

const AS_EMPLOYEE = { authRole: "employee" };
const AS_USER = { authRole: "user" };

export const fetchPurchaseRate = createAsyncThunk(
  "purchases/rate",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/purchases/rate", AS_EMPLOYEE);
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load today's rate"));
    }
  }
);

export const fetchCustomers = createAsyncThunk(
  "purchases/customers",
  async ({ search = "" } = {}, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/purchases/customers", {
        ...AS_EMPLOYEE,
        params: { search },
      });
      return data.customers;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load the customer list"));
    }
  }
);

export const fetchCustomerHolding = createAsyncThunk(
  "purchases/customerHolding",
  async (userId, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`/purchases/customers/${userId}`, AS_EMPLOYEE);
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load this customer's silver"));
    }
  }
);

export const recordPurchase = createAsyncThunk(
  "purchases/record",
  async ({ userId, amountPaid }, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post("/purchases", { userId, amountPaid }, AS_EMPLOYEE);
      // The counter list and the customer's balance both just changed.
      dispatch(fetchMyRecordedPurchases());
      dispatch(fetchCustomerHolding(userId));
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not record this purchase"));
    }
  }
);

export const fetchMyRecordedPurchases = createAsyncThunk(
  "purchases/recordedByMe",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/purchases/recorded-by-me", AS_EMPLOYEE);
      return data.purchases;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load your recorded purchases"));
    }
  }
);

// The customer's own view. The portal's summary card wants a handful of
// recent rows; the full History page asks for more with { limit }.
// The admin panel: the full purchase ledger, across every employee. No
// `authRole` needed - /purchases isn't under /employee, so the interceptor
// reaches for the admin token by default.
export const fetchAllPurchases = createAsyncThunk(
  "purchases/all",
  async ({ search = "", from = "", to = "", limit = 200 } = {}, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/purchases", { params: { search, from, to, limit } });
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load the purchase ledger"));
    }
  }
);

export const fetchMyHolding = createAsyncThunk(
  "purchases/myHolding",
  async ({ limit } = {}, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/purchases/my-holding", {
        ...AS_USER,
        params: limit ? { limit } : undefined,
      });
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load your silver"));
    }
  }
);

// `totalGrams` is the NET holding - bought minus sold back - which is what
// every screen showing a balance acts on. See backend/utils/holding.js.
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

const purchasesSlice = createSlice({
  name: "purchases",
  initialState: {
    // Counter
    ratePerGram: null,
    rateIsToday: false,
    customers: [],
    customersLoading: false,
    selectedCustomer: null,
    selectedHolding: EMPTY_HOLDING,
    selectedPurchases: [],
    // The sell-backs on the same customer - the holding endpoint returns both
    // sides, so the sell screen needs no request of its own.
    selectedSales: [],
    recorded: [],
    saving: false,
    lastRecorded: null,

    // Admin panel: the full ledger
    all: [],
    allTotals: null,
    allLoading: false,

    // Customer's own view
    holding: EMPTY_HOLDING,
    purchases: [],
    sales: [],
    loading: false,

    error: "",
  },
  reducers: {
    clearPurchaseError(state) {
      state.error = "";
    },
    clearLastRecorded(state) {
      state.lastRecorded = null;
    },
    // Clearing the selection also clears what was shown for it, so the
    // previous customer's silver can't linger on screen next to a new name.
    selectCustomer(state, action) {
      state.selectedCustomer = action.payload;
      state.selectedHolding = EMPTY_HOLDING;
      state.selectedPurchases = [];
      state.selectedSales = [];
      state.lastRecorded = null;
      state.error = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPurchaseRate.fulfilled, (state, action) => {
        state.ratePerGram = action.payload.ratePerGram;
        state.rateIsToday = action.payload.isToday;
      })
      .addCase(fetchPurchaseRate.rejected, (state, action) => {
        state.error = action.payload;
      })

      .addCase(fetchCustomers.pending, (state) => {
        state.customersLoading = true;
      })
      .addCase(fetchCustomers.fulfilled, (state, action) => {
        state.customersLoading = false;
        state.customers = action.payload;
      })
      .addCase(fetchCustomers.rejected, (state, action) => {
        state.customersLoading = false;
        state.error = action.payload;
      })

      .addCase(fetchCustomerHolding.fulfilled, (state, action) => {
        state.selectedCustomer = action.payload.customer;
        state.selectedHolding = action.payload.holding;
        state.selectedPurchases = action.payload.purchases;
        state.selectedSales = action.payload.sales || [];
      })
      .addCase(fetchCustomerHolding.rejected, (state, action) => {
        state.error = action.payload;
      })

      .addCase(recordPurchase.pending, (state) => {
        state.saving = true;
        state.error = "";
        state.lastRecorded = null;
      })
      .addCase(recordPurchase.fulfilled, (state, action) => {
        state.saving = false;
        state.lastRecorded = action.payload.purchase;
        state.selectedHolding = action.payload.holding;
      })
      .addCase(recordPurchase.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload;
      })

      .addCase(fetchMyRecordedPurchases.fulfilled, (state, action) => {
        state.recorded = action.payload;
      })

      .addCase(fetchAllPurchases.pending, (state) => {
        state.allLoading = true;
        state.error = "";
      })
      .addCase(fetchAllPurchases.fulfilled, (state, action) => {
        state.allLoading = false;
        state.all = action.payload.purchases;
        state.allTotals = action.payload.totals;
      })
      .addCase(fetchAllPurchases.rejected, (state, action) => {
        state.allLoading = false;
        state.error = action.payload;
      })

      .addCase(fetchMyHolding.pending, (state) => {
        state.loading = true;
        state.error = "";
      })
      .addCase(fetchMyHolding.fulfilled, (state, action) => {
        state.loading = false;
        state.holding = action.payload.holding;
        state.purchases = action.payload.purchases;
        state.sales = action.payload.sales || [];
      })
      .addCase(fetchMyHolding.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearPurchaseError, clearLastRecorded, selectCustomer } = purchasesSlice.actions;

export default purchasesSlice.reducer;
