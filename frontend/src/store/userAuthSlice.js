// User session state for the portal at /user.
// Users have their own table but share the /auth and /profile endpoints with
// the admin panel - the token's role tells the server which table to read.
// `authRole` keeps this session's token apart from an admin's in the same
// browser.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api, { USER_TOKEN_KEY, apiErrorMessage } from "../api/axios.js";

const USER_KEY = "portalUser";

// Every request from this slice must carry the user token, never the admin's.
const asUser = { authRole: "user" };

function readStoredUser() {
  const saved = localStorage.getItem(USER_KEY);
  return saved ? JSON.parse(saved) : null;
}

function persist(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export const loginUser = createAsyncThunk(
  "userAuth/login",
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const { data } = await api.post(
        "/auth/login",
        { email, password, role: "user" },
        asUser
      );
      return data;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Login failed. Please try again."));
    }
  }
);

export const fetchUserProfile = createAsyncThunk(
  "userAuth/fetchProfile",
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get("/profile", asUser);
      return data.user;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not load your profile"));
    }
  }
);

// The only part of their own record a user may change - the rest was filled in
// by the employee who registered them.
export const updateUserPhoto = createAsyncThunk(
  "userAuth/updatePhoto",
  async (file, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      formData.append("profileImage", file);

      const { data } = await api.put("/profile/image", formData, {
        ...asUser,
        headers: { "Content-Type": "multipart/form-data" },
      });
      return data.user;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not update your photo"));
    }
  }
);

export const changeUserPassword = createAsyncThunk(
  "userAuth/changePassword",
  async ({ currentPassword, newPassword }, { rejectWithValue }) => {
    try {
      const { data } = await api.put(
        "/profile/change-password",
        { currentPassword, newPassword },
        asUser
      );
      return data.message;
    } catch (error) {
      return rejectWithValue(apiErrorMessage(error, "Could not change your password"));
    }
  }
);

const userAuthSlice = createSlice({
  name: "userAuth",
  initialState: {
    token: localStorage.getItem(USER_TOKEN_KEY),
    user: readStoredUser(),
    loading: false,
    error: "",
    passwordChanged: false,
    photoUploading: false,
    photoError: "",
  },
  reducers: {
    userLogout(state) {
      localStorage.removeItem(USER_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      state.token = null;
      state.user = null;
      state.error = "";
      state.passwordChanged = false;
      state.photoError = "";
    },
    clearUserAuthError(state) {
      state.error = "";
      state.passwordChanged = false;
      state.photoError = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = "";
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.token = action.payload.token;
        state.user = action.payload.user;
        localStorage.setItem(USER_TOKEN_KEY, action.payload.token);
        persist(action.payload.user);
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchUserProfile.fulfilled, (state, action) => {
        state.user = action.payload;
        persist(action.payload);
      })
      // An expired or deleted session shouldn't leave stale details on screen.
      .addCase(fetchUserProfile.rejected, (state) => {
        localStorage.removeItem(USER_TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        state.token = null;
        state.user = null;
      })
      .addCase(updateUserPhoto.pending, (state) => {
        state.photoUploading = true;
        state.photoError = "";
      })
      // The image route answers with the plain account row, without the
      // registration details GET /profile adds on, so merge rather than
      // replace - otherwise saving a photo would blank the details on screen.
      .addCase(updateUserPhoto.fulfilled, (state, action) => {
        state.photoUploading = false;
        state.user = { ...state.user, ...action.payload };
        persist(state.user);
      })
      .addCase(updateUserPhoto.rejected, (state, action) => {
        state.photoUploading = false;
        state.photoError = action.payload;
      })
      .addCase(changeUserPassword.pending, (state) => {
        state.loading = true;
        state.error = "";
        state.passwordChanged = false;
      })
      .addCase(changeUserPassword.fulfilled, (state) => {
        state.loading = false;
        state.passwordChanged = true;
      })
      .addCase(changeUserPassword.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { userLogout, clearUserAuthError } = userAuthSlice.actions;

export const selectUser = (state) => state.userAuth.user;
export const selectIsUserAuthenticated = (state) => !!state.userAuth.token;

export default userAuthSlice.reducer;
