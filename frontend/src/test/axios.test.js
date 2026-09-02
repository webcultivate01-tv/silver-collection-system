// The shared API client.
//
// All three sessions can be signed in at once in one browser, so the client
// picks a token per request. The rule it picks by is a URL prefix, and the two
// prefixes it has to tell apart are "/employee" (the employee portal) and
// "/employees" (the admin's employee management) - one character. Getting that
// wrong would send the admin's token to the employee API, or worse.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import api, {
  apiErrorMessage,
  fileUrl,
  ADMIN_TOKEN_KEY,
  EMPLOYEE_TOKEN_KEY,
  USER_TOKEN_KEY,
  API_ORIGIN,
} from "../api/axios.js";

// Runs a config object through the request interceptor the way axios would.
function throughRequestInterceptor(config) {
  const handler = api.interceptors.request.handlers[0];
  return handler.fulfilled({ headers: {}, ...config });
}

// Runs an error through the response interceptor, returning the rejection.
async function throughResponseInterceptor(error) {
  const handler = api.interceptors.response.handlers[0];
  try {
    await handler.rejected(error);
    return null;
  } catch (rejected) {
    return rejected;
  }
}

beforeEach(() => {
  localStorage.setItem(ADMIN_TOKEN_KEY, "admin-token");
  localStorage.setItem(EMPLOYEE_TOKEN_KEY, "employee-token");
  localStorage.setItem(USER_TOKEN_KEY, "user-token");
});

describe("choosing which token to send", () => {
  it("sends the employee token to the employee portal API", () => {
    const paths = [
      "/employee",
      "/employee/me",
      "/employee/login",
      "/employee/users",
      "/employee/users/12",
      "/employee/change-password",
    ];

    for (const url of paths) {
      const config = throughRequestInterceptor({ url });
      expect(config.headers.Authorization, url).toBe("Bearer employee-token");
    }
  });

  it("sends the ADMIN token to /employees, which is a different API", () => {
    // The one-character distinction. /api/employees is admin employee
    // management; /api/employee/* is the portal.
    for (const url of ["/employees", "/employees/12", "/employees/12/block"]) {
      const config = throughRequestInterceptor({ url });
      expect(config.headers.Authorization, url).toBe("Bearer admin-token");
    }
  });

  it("defaults to the admin token for shared paths", () => {
    for (const url of ["/profile", "/auth/login", "/reports/summary", "/silver-rate/today"]) {
      const config = throughRequestInterceptor({ url });
      expect(config.headers.Authorization, url).toBe("Bearer admin-token");
    }
  });

  it("lets a caller name the session explicitly with authRole", () => {
    // How the user portal reaches /profile, which admin and user share.
    const asUser = throughRequestInterceptor({ url: "/profile", authRole: "user" });
    expect(asUser.headers.Authorization).toBe("Bearer user-token");

    const asEmployee = throughRequestInterceptor({ url: "/profile", authRole: "employee" });
    expect(asEmployee.headers.Authorization).toBe("Bearer employee-token");
  });

  it("sends no Authorization header when that session has no token", () => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);

    const config = throughRequestInterceptor({ url: "/profile" });
    expect(config.headers.Authorization).toBeUndefined();
  });

  it("keeps the three sessions independent", () => {
    localStorage.removeItem(EMPLOYEE_TOKEN_KEY);

    expect(throughRequestInterceptor({ url: "/employee/me" }).headers.Authorization).toBeUndefined();
    expect(throughRequestInterceptor({ url: "/profile" }).headers.Authorization).toBe(
      "Bearer admin-token"
    );
  });
});

describe("handling a 401", () => {
  let replace;

  beforeEach(() => {
    replace = vi.fn();
    // jsdom's window.location is not writable, so swap it for a stub.
    delete window.location;
    window.location = { pathname: "/dashboard", replace };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clears only the session that failed, and sends it to its own login", async () => {
    await throughResponseInterceptor({
      config: { url: "/employee/me" },
      response: { status: 401 },
    });

    expect(localStorage.getItem(EMPLOYEE_TOKEN_KEY)).toBeNull();
    // The other two sessions are untouched.
    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBe("admin-token");
    expect(localStorage.getItem(USER_TOKEN_KEY)).toBe("user-token");
    expect(replace).toHaveBeenCalledWith("/employee");
  });

  it("sends an expired admin session to the admin login", async () => {
    await throughResponseInterceptor({
      config: { url: "/reports/summary" },
      response: { status: 401 },
    });

    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
    expect(replace).toHaveBeenCalledWith("/admin");
  });

  it("sends an expired user session to the user login", async () => {
    await throughResponseInterceptor({
      config: { url: "/profile", authRole: "user" },
      response: { status: 401 },
    });

    expect(localStorage.getItem(USER_TOKEN_KEY)).toBeNull();
    expect(replace).toHaveBeenCalledWith("/user");
  });

  it("does NOT redirect when the 401 is a failed login attempt", async () => {
    // A wrong password must leave the message on the form, not bounce the
    // page back to the form it is already on.
    for (const url of ["/auth/login", "/employee/login"]) {
      await throughResponseInterceptor({ config: { url }, response: { status: 401 } });
    }

    expect(replace).not.toHaveBeenCalled();
    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBe("admin-token");
  });

  it("does not redirect if already on that login page", async () => {
    window.location.pathname = "/admin";

    await throughResponseInterceptor({
      config: { url: "/reports/summary" },
      response: { status: 401 },
    });

    expect(replace).not.toHaveBeenCalled();
  });

  it("leaves a 403 alone, because the session is still valid", async () => {
    // A sub-admin attempting a write gets 403, and that message has to reach
    // the page rather than ending the session.
    await throughResponseInterceptor({
      config: { url: "/employees" },
      response: { status: 403, data: { message: "Sub-admin accounts can view..." } },
    });

    expect(replace).not.toHaveBeenCalled();
    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBe("admin-token");
  });

  it("leaves a 500 and a network failure alone", async () => {
    await throughResponseInterceptor({ config: { url: "/profile" }, response: { status: 500 } });
    await throughResponseInterceptor({ config: { url: "/profile" } }); // no response at all

    expect(replace).not.toHaveBeenCalled();
    expect(localStorage.getItem(ADMIN_TOKEN_KEY)).toBe("admin-token");
  });

  it("still rejects the promise, so the caller sees the failure", async () => {
    const error = { config: { url: "/profile" }, response: { status: 401 } };
    const rejected = await throughResponseInterceptor(error);

    expect(rejected).toBe(error);
  });
});

describe("apiErrorMessage", () => {
  it("prefers the server's own message", () => {
    const error = { response: { data: { message: "Customer not found" } } };
    expect(apiErrorMessage(error)).toBe("Customer not found");
  });

  it("falls back when the server said nothing useful", () => {
    expect(apiErrorMessage({}, "Could not load")).toBe("Could not load");
    expect(apiErrorMessage({ response: {} }, "Could not load")).toBe("Could not load");
    expect(apiErrorMessage({ response: { data: {} } }, "Could not load")).toBe("Could not load");
  });

  it("has a default fallback", () => {
    expect(apiErrorMessage(new Error("network"))).toBe("Something went wrong");
  });
});

describe("resolving the API base URL", () => {
  it("derives the static file origin by dropping the /api suffix", () => {
    // Used to build URLs for uploaded images, so a trailing /api here would
    // break every document and profile photo in the app.
    expect(API_ORIGIN).not.toMatch(/\/api\/?$/);
    expect(API_ORIGIN).toBe("http://localhost:5000");
  });
});

describe("fileUrl - authenticated document URLs", () => {
  const ORIGINAL = window.location;

  function atPath(pathname) {
    delete window.location;
    window.location = { ...ORIGINAL, pathname, replace: () => {} };
  }

  afterEach(() => {
    delete window.location;
    window.location = ORIGINAL;
  });

  it("returns an empty string for a missing path", () => {
    expect(fileUrl(null)).toBe("");
    expect(fileUrl(undefined)).toBe("");
    expect(fileUrl("")).toBe("");
  });

  it("appends the token, because an <img> cannot set a header", () => {
    atPath("/dashboard/employees/1");

    const url = fileUrl("/uploads/employees/ramesh/aadhaar-front-1.jpg");

    expect(url).toContain("http://localhost:5000/uploads/employees/ramesh/aadhaar-front-1.jpg");
    expect(url).toContain("token=admin-token");
  });

  it("picks the session from the current route", () => {
    // All three sessions can be signed in at once, so the document components -
    // which render on all three panels - need the right one.
    atPath("/employee/users/4");
    expect(fileUrl("/uploads/x.jpg")).toContain("token=employee-token");

    atPath("/user/profile");
    expect(fileUrl("/uploads/x.jpg")).toContain("token=user-token");

    atPath("/sub-admin/reports");
    expect(fileUrl("/uploads/x.jpg")).toContain("token=admin-token");
  });

  it("does not mistake /dashboard/employees for the employee portal", () => {
    // The same one-character distinction the request interceptor has to make.
    atPath("/dashboard/employees");
    expect(fileUrl("/uploads/x.jpg")).toContain("token=admin-token");
  });

  it("lets a caller name the session explicitly", () => {
    atPath("/dashboard");
    expect(fileUrl("/uploads/x.jpg", "user")).toContain("token=user-token");
  });

  it("url-encodes the token rather than pasting it in raw", () => {
    localStorage.setItem(ADMIN_TOKEN_KEY, "a+b/c=d");
    atPath("/dashboard");

    const url = fileUrl("/uploads/x.jpg");
    expect(url).toContain("token=a%2Bb%2Fc%3Dd");
  });

  it("omits the query entirely when that session has no token", () => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    atPath("/dashboard");

    expect(fileUrl("/uploads/x.jpg")).toBe("http://localhost:5000/uploads/x.jpg");
  });
});
