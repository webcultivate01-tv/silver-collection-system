// The panel's Enquiries screen: the messages left on the public contact form,
// and what the shop has done about each one.
//
// Shared by both panel roles, so every call here goes out on the admin session
// (no `authRole` needed - /enquiries is not an /employee URL). The main admin
// and a sub-admin hit the same endpoints; the only one a sub-admin will be
// refused is the delete, and that refusal arrives as a plain 403 message the
// screen shows like any other error.
//
// The public form does NOT go through here. It posts to the same path with no
// session at all, straight from EnquiryForm.jsx, because none of this state
// belongs on the landing page.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api, { apiErrorMessage } from "../api/axios.js";

export const fetchEnquiries = createAsyncThunk(
  "enquiries/fetchAll",
  async ({ status = "all", search = "", from = "", to = "" } = {}, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/enquiries", { params: { status, search, from, to } });
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load enquiries"));
    }
  }
);

// Moving one along, and the note that says what was done about it.
//
// `note` is left out of the request entirely unless the caller passed one: the
// status buttons on each row send only a status, and the server keeps whatever
// note is stored when it doesn't see the field. Sending "" instead would wipe
// a note somebody typed on the detail panel.
export const updateEnquiry = createAsyncThunk(
  "enquiries/update",
  async ({ id, status, note }, { dispatch, getState, rejectWithValue }) => {
    try {
      const body = note === undefined ? { status } : { status, note };
      const { data } = await api.patch(`/enquiries/${id}`, body);

      // The counts above the list belong to the whole table, so a status
      // change moves one of them - only a re-read keeps the tabs honest.
      dispatch(fetchEnquiries(getState().enquiries.filters));
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not update this enquiry"));
    }
  }
);

// Main admin only. A sub-admin gets a 403 with the read-only message on it.
export const deleteEnquiry = createAsyncThunk(
  "enquiries/delete",
  async (id, { dispatch, getState, rejectWithValue }) => {
    try {
      const { data } = await api.delete(`/enquiries/${id}`);

      dispatch(fetchEnquiries(getState().enquiries.filters));
      return { ...data, id };
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not delete this enquiry"));
    }
  }
);

const EMPTY_COUNTS = { total: 0, new: 0, in_progress: 0, closed: 0 };

const initialState = {
  list: [],
  counts: EMPTY_COUNTS,
  // Kept here rather than only in the component so that an update can re-read
  // the list the screen is actually showing.
  filters: { status: "all", search: "", from: "", to: "" },
  loading: false,
  saving: false,
  notice: "",
  error: "",
};

const enquiriesSlice = createSlice({
  name: "enquiries",
  initialState,
  reducers: {
    clearEnquiriesError(state) {
      state.error = "";
    },
    clearEnquiriesNotice(state) {
      state.notice = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchEnquiries.pending, (state, action) => {
        state.loading = true;
        state.filters = { ...state.filters, ...(action.meta.arg || {}) };
      })
      .addCase(fetchEnquiries.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload.enquiries;
        state.counts = action.payload.counts || EMPTY_COUNTS;
      })
      .addCase(fetchEnquiries.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      .addCase(updateEnquiry.pending, (state) => {
        state.saving = true;
        state.error = "";
        state.notice = "";
      })
      .addCase(updateEnquiry.fulfilled, (state, action) => {
        state.saving = false;
        state.notice = action.payload.message;
        // Patched in place as well as re-read, so the row changes the moment
        // the button is pressed rather than when the list comes back.
        state.list = state.list.map((enquiry) =>
          enquiry.id === action.payload.enquiry.id ? action.payload.enquiry : enquiry
        );
      })
      .addCase(updateEnquiry.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload;
      })

      .addCase(deleteEnquiry.pending, (state) => {
        state.saving = true;
        state.error = "";
        state.notice = "";
      })
      .addCase(deleteEnquiry.fulfilled, (state, action) => {
        state.saving = false;
        state.notice = action.payload.message;
        state.list = state.list.filter((enquiry) => enquiry.id !== action.payload.id);
      })
      .addCase(deleteEnquiry.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload;
      });
  },
});

export const { clearEnquiriesError, clearEnquiriesNotice } = enquiriesSlice.actions;

export default enquiriesSlice.reducer;
