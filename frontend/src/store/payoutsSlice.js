// The admin's Silver Payout flow, as five pieces of state that follow the five
// steps of the screen:
//
//   employees  ->  users  ->  view  ->  report  ->  receipt
//
// The rule this slice exists to enforce is that those five stay in step. A
// report describes one customer, one weight and one rate; the moment any of
// those changes underneath it - a different customer picked, the amount
// retyped, a payment made - the report is stale, and a stale report must never
// be sitting on screen next to a live "Confirm payment" button.
//
// So every action that could invalidate a report clears it. There is no path
// through this file where `report` survives a change to what it describes.
// The server refuses a stale report too (see backend/controllers/
// payoutController.js), but the admin should never get far enough to be
// refused: they should be looking at figures that are true.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api, { apiErrorMessage } from "../api/axios.js";

// Step 1: every employee, with how much silver their clients hold.
export const fetchPayoutEmployees = createAsyncThunk(
  "payouts/employees",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/payouts/employees");
      return data.employees;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load employees"));
    }
  }
);

// Step 2: that employee's client book, each row with its own holding.
export const fetchPayoutUsers = createAsyncThunk(
  "payouts/users",
  async ({ employeeId, search = "" }, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`/payouts/employees/${employeeId}/users`, {
        params: { search },
      });
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load this employee's users"));
    }
  }
);

// Step 3: one customer's silver, today's rate, and their past payouts.
export const fetchPayoutUserView = createAsyncThunk(
  "payouts/userView",
  async (userId, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`/payouts/users/${userId}`);
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load this user's silver"));
    }
  }
);

// Step 4: the report. Writes nothing - it can be generated as often as needed.
export const generatePayoutReport = createAsyncThunk(
  "payouts/report",
  async ({ userId, grams, amountPayable }, { rejectWithValue }) => {
    try {
      const body =
        amountPayable !== undefined && amountPayable !== null && amountPayable !== ""
          ? { userId, amountPayable }
          : { userId, grams };

      const { data } = await api.post("/payouts/report", body);
      return data.report;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not generate the payout report"));
    }
  }
);

// Step 5: the payment. The only call in this file that changes anything.
//
// `reference`, `grams` and `ratePerGram` are copied straight off the report
// rather than re-read from the form, so what is paid is what the admin was
// looking at when they pressed the button - not what the form happens to hold
// a moment later.
export const confirmPayout = createAsyncThunk(
  "payouts/pay",
  async ({ report }, { dispatch, rejectWithValue }) => {
    try {
      const { data } = await api.post("/payouts", {
        userId: report.customer.id,
        grams: report.payout.grams,
        ratePerGram: report.payout.ratePerGram,
        reference: report.reference,
      });

      // The customer's silver just changed, and so did their employee's book
      // total. Re-read both rather than adjusting the numbers here: a figure
      // patched by hand on the client is a figure that can drift from the
      // ledger.
      dispatch(fetchPayoutUserView(report.customer.id));
      if (report.customer.employeeId) {
        dispatch(fetchPayoutUsers({ employeeId: report.customer.employeeId }));
      }
      dispatch(fetchPayoutEmployees());

      return data;
    } catch (error) {
      return rejectWithValue({
        message: apiErrorMessage(error, "Could not complete this payout"),
        // A stale rate is not a failure the admin can retry past - the report
        // has to be regenerated - so the screen needs to tell them apart.
        staleRate: !!error.response?.data?.staleRate,
      });
    }
  }
);

const initialState = {
  employees: [],
  employeesLoading: false,

  employeeId: "",

  users: [],
  usersTotals: null,
  usersLoading: false,

  userId: null,
  view: null,
  viewLoading: false,

  report: null,
  reportLoading: false,
  reportError: "",

  paying: false,
  // The report as it was actually paid, kept so the admin can print a receipt
  // afterwards. Distinct from `report`, which is only ever a proposal.
  receipt: null,
  paidMessage: "",

  error: "",
};

const payoutsSlice = createSlice({
  name: "payouts",
  initialState,
  reducers: {
    // Choosing a different employee drops everything downstream of that
    // choice: their users, the customer, the report.
    selectPayoutEmployee(state, action) {
      state.employeeId = action.payload;
      state.users = [];
      state.usersTotals = null;
      state.userId = null;
      state.view = null;
      state.report = null;
      state.reportError = "";
      state.receipt = null;
      state.paidMessage = "";
      state.error = "";
    },

    selectPayoutUser(state, action) {
      state.userId = action.payload;
      state.view = null;
      state.report = null;
      state.reportError = "";
      state.receipt = null;
      state.paidMessage = "";
      state.error = "";
    },

    // The amount was retyped, so the report no longer describes what is on the
    // form. Called on every keystroke in the amount box.
    clearPayoutReport(state) {
      state.report = null;
      state.reportError = "";
    },

    clearPayoutReceipt(state) {
      state.receipt = null;
      state.paidMessage = "";
    },

    clearPayoutError(state) {
      state.error = "";
      state.reportError = "";
    },

    // Back to step 1, for "pay someone else" after a payment.
    resetPayoutFlow() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPayoutEmployees.pending, (state) => {
        state.employeesLoading = true;
        state.error = "";
      })
      .addCase(fetchPayoutEmployees.fulfilled, (state, action) => {
        state.employeesLoading = false;
        state.employees = action.payload;
      })
      .addCase(fetchPayoutEmployees.rejected, (state, action) => {
        state.employeesLoading = false;
        state.error = action.payload;
      })

      .addCase(fetchPayoutUsers.pending, (state) => {
        state.usersLoading = true;
        state.error = "";
      })
      .addCase(fetchPayoutUsers.fulfilled, (state, action) => {
        state.usersLoading = false;
        state.users = action.payload.users;
        state.usersTotals = action.payload.totals;
      })
      .addCase(fetchPayoutUsers.rejected, (state, action) => {
        state.usersLoading = false;
        state.error = action.payload;
      })

      .addCase(fetchPayoutUserView.pending, (state) => {
        state.viewLoading = true;
        state.error = "";
      })
      .addCase(fetchPayoutUserView.fulfilled, (state, action) => {
        state.viewLoading = false;
        state.view = action.payload;
      })
      .addCase(fetchPayoutUserView.rejected, (state, action) => {
        state.viewLoading = false;
        state.error = action.payload;
      })

      .addCase(generatePayoutReport.pending, (state) => {
        state.reportLoading = true;
        state.reportError = "";
        // Drop the old report before the new one lands, so a slow request can
        // never leave last figures on screen under a fresh-looking spinner.
        state.report = null;
      })
      .addCase(generatePayoutReport.fulfilled, (state, action) => {
        state.reportLoading = false;
        state.report = action.payload;
      })
      .addCase(generatePayoutReport.rejected, (state, action) => {
        state.reportLoading = false;
        state.reportError = action.payload;
      })

      .addCase(confirmPayout.pending, (state) => {
        state.paying = true;
        state.error = "";
      })
      .addCase(confirmPayout.fulfilled, (state, action) => {
        state.paying = false;
        state.paidMessage = action.payload.message;

        // A repeat of a payout already made comes back without a report - the
        // money moved the first time, and there is nothing new to receipt.
        state.receipt = action.payload.report || state.receipt;

        // Spent. Clearing it is what stops the same reference being sent
        // again from a button still on screen.
        state.report = null;
      })
      .addCase(confirmPayout.rejected, (state, action) => {
        state.paying = false;
        state.error = action.payload?.message || "Could not complete this payout";

        // The rate moved while the report was open. The report is wrong now,
        // so it goes - the admin generates a new one and sees the new figures
        // before paying anything.
        if (action.payload?.staleRate) state.report = null;
      });
  },
});

export const {
  selectPayoutEmployee,
  selectPayoutUser,
  clearPayoutReport,
  clearPayoutReceipt,
  clearPayoutError,
  resetPayoutFlow,
} = payoutsSlice.actions;

export default payoutsSlice.reducer;
