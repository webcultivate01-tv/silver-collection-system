// One shared axios instance for the whole app.
// It automatically attaches the right JWT to every request.

import axios from "axios";

// VITE_API_URL is baked in at *build* time. If a production build is ever
// shipped without it set (e.g. `npm run build` run before `.env` was created
// on the VPS), falling back to "http://localhost:5000/api" would make every
// admin/sub-admin/user/employee request go to the visitor's own machine and
// fail outright. Local dev (`npm run dev`) still needs that localhost
// fallback since the backend really does run on :5000 there; anywhere else,
// assume the API is reverse-proxied under /api on the same origin the app
// was served from - the standard single-VPS setup - instead of guessing wrong.
function resolveApiUrl() {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;

  const { hostname, origin } = window.location;
  const isLocalDev = hostname === "localhost" || hostname === "127.0.0.1";
  return isLocalDev ? "http://localhost:5000/api" : `${origin}/api`;
}

const API_URL = resolveApiUrl();

// Base host without the trailing "/api", used to build URLs for static
// files served by the backend (e.g. uploaded profile images).
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, "");

export const ADMIN_TOKEN_KEY = "token";
export const EMPLOYEE_TOKEN_KEY = "employeeToken";
export const USER_TOKEN_KEY = "userToken";

const TOKEN_KEYS = {
  admin: ADMIN_TOKEN_KEY,
  employee: EMPLOYEE_TOKEN_KEY,
  user: USER_TOKEN_KEY,
};

// Builds the URL for an uploaded file - a profile photo, an Aadhaar or PAN
// scan - from the public path the API returned.
//
// Those files are no longer served statically: they are Aadhaar and PAN scans,
// and the backend now authenticates and ownership-checks every request for
// one. An <img> tag cannot set an Authorization header, so the token goes on
// the query string instead.
//
// Which of the three sessions the screen currently on display belongs to.
//
// All three can be signed in at once, so "the token" is ambiguous unless
// something says which. The API client answers that from the request's URL
// prefix; here the equivalent is the page's own route, and the app's routes
// already separate the three cleanly: /employee/* is the employee portal,
// /user/* is the customer portal, and everything else (/admin, /dashboard/*,
// /sub-admin/*) is the panel.
function sessionForCurrentPath() {
  const pathname = window.location?.pathname || "";

  if (/^\/employee(\/|$)/.test(pathname)) return "employee";
  if (/^\/user(\/|$)/.test(pathname)) return "user";
  return "admin";
}

// `role` says which of the three sessions is asking, the same way `authRole`
// does on an API call. Left out, it is worked out from the current route,
// which is what the shared document components need - they render on all
// three panels.
export function fileUrl(publicPath, role) {
  if (!publicPath) return "";

  const key = TOKEN_KEYS[role || sessionForCurrentPath()] || ADMIN_TOKEN_KEY;
  const token = localStorage.getItem(key);
  const url = `${API_ORIGIN}${publicPath}`;

  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}

const api = axios.create({
  baseURL: API_URL,
});

// The employee portal's own endpoints: /employee, /employee/me, ... but NOT
// /employees, which is the admin's employee-management API.
const EMPLOYEE_PORTAL_URL = /^\/employee(\/|$)/;

// All three roles can be signed in at the same time in one browser, so the
// token is picked per request rather than from a global. Employee calls have
// their own URL prefix; admin and user share /auth and /profile, so those
// requests say which session they belong to with `authRole: "user"`.
api.interceptors.request.use((config) => {
  const role =
    config.authRole || (EMPLOYEE_PORTAL_URL.test(config.url || "") ? "employee" : "admin");
  const token = localStorage.getItem(TOKEN_KEYS[role] || ADMIN_TOKEN_KEY);

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Where each session's own login page lives, and what it keeps in storage.
// The three doors stay separate: a dead admin session never lands anyone on
// the user or employee login.
const SESSIONS = {
  admin: { loginPath: "/admin", keys: [ADMIN_TOKEN_KEY, "user"] },
  employee: { loginPath: "/employee", keys: [EMPLOYEE_TOKEN_KEY, "employee"] },
  user: { loginPath: "/user", keys: [USER_TOKEN_KEY, "portalUser"] },
};

// Signing in is allowed to fail with a 401 (wrong password) - that message
// belongs on the login form, not in a redirect back to it.
const LOGIN_URL = /^\/(auth\/login|employee\/login)$/;

// A 401 means the session is gone: the token expired, the account was deleted,
// or storage was cleared (a logout in another tab, or a different origin such
// as 127.0.0.1 instead of localhost). Redux only reads the token once at
// startup, so without this the app keeps rendering a signed-in dashboard while
// every request goes out anonymously and fails with "no token provided".
// Clearing the session here sends them back to their own login instead.
//
// 403 is deliberately left alone: that is a permission answer for a session
// that is still valid (a sub-admin attempting a write), and its message needs
// to show up on the page.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const config = error.config || {};
    const url = config.url || "";

    if (error.response?.status === 401 && !LOGIN_URL.test(url)) {
      const role = config.authRole || (EMPLOYEE_PORTAL_URL.test(url) ? "employee" : "admin");
      const session = SESSIONS[role] || SESSIONS.admin;

      session.keys.forEach((key) => localStorage.removeItem(key));

      if (window.location.pathname !== session.loginPath) {
        window.location.replace(session.loginPath);
      }
    }

    return Promise.reject(error);
  }
);

// Turns an axios failure into the plain message our slices reject with.
export function apiErrorMessage(error, fallback = "Something went wrong") {
  return error.response?.data?.message || fallback;
}

export default api;
