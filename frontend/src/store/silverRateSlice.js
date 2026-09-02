// Today's silver rate (navbar) plus the admin's rate history.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api, { apiErrorMessage } from "../api/axios.js";

export const fetchTodayRate = createAsyncThunk(
  "silverRate/fetchToday",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/silver-rate/today");
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load today's silver rate"));
    }
  }
);

export const fetchRateHistory = createAsyncThunk(
  "silverRate/fetchHistory",
  async ({ search = "", from = "", to = "" } = {}, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/silver-rate/history", { params: { search, from, to } });
      return data.rates;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load the rate history"));
    }
  }
);

export const saveTodayRate = createAsyncThunk(
  "silverRate/save",
  // The history is deliberately NOT refreshed from in here. It used to be, with
  // no arguments, which reset the list to "the last 30 days, unfiltered" - so
  // publishing a rate silently threw away whatever date range the admin had
  // applied. The screen refetches with its own live filters instead.
  async ({ buyRatePerGram, sellRatePerGram }, { rejectWithValue }) => {
    try {
      const { data } = await api.post("/silver-rate", { buyRatePerGram, sellRatePerGram });
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not save the rate"));
    }
  }
);

const silverRateSlice = createSlice({
  name: "silverRate",
  initialState: {
    rate: null,
    previousRate: null,
    change: null,
    isToday: false,
    history: [],
    historyLoading: false,
    loading: false,
    saving: false,
    error: "",
    savedMessage: "",
  },
  reducers: {
    clearRateStatus(state) {
      state.error = "";
      state.savedMessage = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTodayRate.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchTodayRate.fulfilled, (state, action) => {
        state.loading = false;
        state.rate = action.payload.rate;
        state.previousRate = action.payload.previousRate;
        state.change = action.payload.change;
        state.isToday = action.payload.isToday;
      })
      .addCase(fetchTodayRate.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      .addCase(fetchRateHistory.pending, (state) => {
        state.historyLoading = true;
      })
      .addCase(fetchRateHistory.fulfilled, (state, action) => {
        state.historyLoading = false;
        state.history = action.payload;
      })
      .addCase(fetchRateHistory.rejected, (state, action) => {
        state.historyLoading = false;
        state.error = action.payload;
      })

      .addCase(saveTodayRate.pending, (state) => {
        state.saving = true;
        state.error = "";
        state.savedMessage = "";
      })
      .addCase(saveTodayRate.fulfilled, (state, action) => {
        state.saving = false;
        state.rate = action.payload.rate;
        state.previousRate = action.payload.previousRate;
        state.change = action.payload.change;
        state.isToday = true;
        state.savedMessage = action.payload.message;
      })
      .addCase(saveTodayRate.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload;
      });
  },
});

export const { clearRateStatus } = silverRateSlice.actions;

export default silverRateSlice.reducer;
