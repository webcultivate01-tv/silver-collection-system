// The admin panel's Users screen state - read-only.
//
// `employees` is the "Added by" filter: every employee with how many users they
// have registered.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api, { apiErrorMessage } from "../api/axios.js";

export const fetchUsers = createAsyncThunk(
  "adminUsers/fetchAll",
  async ({ search = "", status = "all", employeeId = "" } = {}, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/users", { params: { search, status, employeeId } });
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load users"));
    }
  }
);

export const fetchUser = createAsyncThunk(
  "adminUsers/fetchOne",
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`/users/${id}`);
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load this user"));
    }
  }
);

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

const initialState = {
  list: [],
  counts: { total: 0, active: 0, inactive: 0 },
  employees: [],
  selected: null,
  selectedHolding: EMPTY_HOLDING,
  selectedPurchases: [],
  selectedSales: [],
  loading: false,
  error: "",
};

const adminUsersSlice = createSlice({
  name: "adminUsers",
  initialState,
  reducers: {
    clearSelectedUser(state) {
      state.selected = null;
      state.selectedHolding = EMPTY_HOLDING;
      state.selectedPurchases = [];
      state.selectedSales = [];
      state.error = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.loading = true;
        state.error = "";
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload.users;
        state.counts = action.payload.counts;
        state.employees = action.payload.employees;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      .addCase(fetchUser.pending, (state) => {
        state.loading = true;
        state.error = "";
      })
      .addCase(fetchUser.fulfilled, (state, action) => {
        state.loading = false;
        state.selected = action.payload.user;
        state.selectedHolding = action.payload.holding || EMPTY_HOLDING;
        state.selectedPurchases = action.payload.purchases || [];
        state.selectedSales = action.payload.sales || [];
      })
      .addCase(fetchUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearSelectedUser } = adminUsersSlice.actions;

export default adminUsersSlice.reducer;
