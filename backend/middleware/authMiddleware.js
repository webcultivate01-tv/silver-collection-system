// Protects routes that should only be reachable by a logged-in user.
// Reads the JWT from the "Authorization: Bearer <token>" header,
// verifies it, and attaches the decoded user info to req.user.

const jwt = require("jsonwebtoken");
const EmployeeModel = require("../models/employeeModel");
const { modelForRole, UserModel } = require("../models/accounts");

// Each role has its own table, and an id is only unique inside it - so the
// token's role is what says where to look the id up. See models/accounts.js.
const ROLES = {
  ADMIN: "admin", // main admin - full access        -> admins
  SUB_ADMIN: "subadmin", // reports + cash handovers -> sub_admins
  USER: "user", //                                   -> users
  EMPLOYEE: "employee", //                           -> employees
};

// Both sign in at /admin; what they can do afterwards is what differs.
const PANEL_ROLES = [ROLES.ADMIN, ROLES.SUB_ADMIN];

// A request with one of these methods reads and nothing more.
const READ_ONLY_METHODS = ["GET", "HEAD", "OPTIONS"];

// The writes a sub-admin IS allowed, listed one by one.
//
// A sub-admin is a reporting account with one operational job on top of it:
// taking an employee's end-of-day cash handover, the same way the main admin
// does. That is a write, so the blanket block below would refuse it - and
// opening the block up to "settlements" as a whole would hand them every
// future POST on that router as well. Each allowed write is therefore named
// exactly, method and path, and anything not on this list is still refused.
//
// Paths are matched against req.path, which here is the full path the
// request came in on (this runs before any router, mounted at the root).
const SUB_ADMIN_WRITES = [
  // Accepting one employee cash handover: POST /api/settlements/12/accept
  { method: "POST", path: /^\/api\/settlements\/\d+\/accept\/?$/ },
];

function isAllowedSubAdminWrite(req) {
  return SUB_ADMIN_WRITES.some(
    (allowed) => allowed.method === req.method && allowed.path.test(req.path)
  );
}

// Returns the token payload, or null if there isn't a valid one.
function decodeToken(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  try {
    return jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

function protect(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authorized, no token provided" });
  }

  const decoded = decodeToken(req);

  if (!decoded) {
    return res.status(401).json({ message: "Not authorized, token is invalid or expired" });
  }

  req.user = decoded; // { id, role }
  next();
}

// Builds a guard for the admin-panel roles. It re-reads the account row on
// every request so that deactivating (or deleting) an account immediately
// kills a token the holder is still carrying around.
function requirePanelRole(...allowedRoles) {
  return async (req, res, next) => {
    try {
      if (!allowedRoles.includes(req.user?.role)) {
        return res.status(403).json({
          message:
            allowedRoles.length === 1 && allowedRoles[0] === ROLES.ADMIN
              ? "Admin access required"
              : "You do not have permission to access this",
        });
      }

      // The role in the token picks the table; a role we don't recognise (an old
      // or tampered token) has no table and gets nothing.
      const model = modelForRole(req.user.role);
      const account = model ? await model.findById(req.user.id) : null;

      if (!account) {
        return res.status(401).json({ message: "This account no longer exists" });
      }

      if (!account.is_active) {
        return res.status(403).json({
          message: "Your account has been deactivated. Please contact the main admin.",
        });
      }

      req.account = account;
      next();
    } catch (error) {
      console.error("requirePanelRole failed:", error);
      res.status(500).json({ message: "Something went wrong on the server" });
    }
  };
}

// Existing admin-only routes (employee management, silver rate updates).
// A sub-admin is NOT an admin, so these stay closed to them.
const adminOnly = requirePanelRole(ROLES.ADMIN);

// Admin Management. Same rule as adminOnly, named for what it guards.
const mainAdminOnly = adminOnly;

// Read-only reporting data, shared by the main admin and sub-admins.
const panelReadAccess = requirePanelRole(ROLES.ADMIN, ROLES.SUB_ADMIN);

// The cash handover an employee makes at the end of the day: both panel roles
// can accept one. The same two roles as panelReadAccess, deliberately under a
// second name - this one guards a WRITE, and a route that starts allowing
// sub-admins to read something must not silently start letting them change it
// because the two shared a guard. Every path it protects also has to be named
// in SUB_ADMIN_WRITES above, which is what gets a sub-admin's request this far.
const panelCashAccess = requirePanelRole(ROLES.ADMIN, ROLES.SUB_ADMIN);

// The blanket rule: "a sub-admin reads and downloads", with the writes on
// SUB_ADMIN_WRITES as the only exceptions.
//
// Mounted once in server.js in front of every route that can change something,
// so a sub-admin is stopped before any controller runs - whether the request
// came from the UI, a typed URL or a hand-made API call.
function blockSubAdminWrites(req, res, next) {
  if (READ_ONLY_METHODS.includes(req.method)) return next();
  if (isAllowedSubAdminWrite(req)) return next();

  const decoded = decodeToken(req);

  if (decoded?.role === ROLES.SUB_ADMIN) {
    return res.status(403).json({
      message:
        "Sub-admin accounts can view and download reports and accept cash handovers. This action is not permitted.",
    });
  }

  next();
}

// The only two things an employee holding an admin-issued temporary password
// may do: look at their own account, and replace that password. Everything
// else waits until they have.
const TEMP_PASSWORD_ALLOWED = [
  { method: "GET", path: /^\/api\/employee\/me\/?$/ },
  { method: "PUT", path: /^\/api\/employee\/change-password\/?$/ },
];

// originalUrl, not req.path: this guard runs inside a router mounted at
// /api/employee, where req.path is only the part AFTER the mount point
// ("/change-password"). Matching against req.path would never match a pattern
// written as a full path, which would lock an employee out of the one screen
// they are supposed to be able to reach.
function isAllowedOnTempPassword(req) {
  const fullPath = (req.originalUrl || "").split("?")[0];

  return TEMP_PASSWORD_ALLOWED.some(
    (allowed) => allowed.method === req.method && allowed.path.test(fullPath)
  );
}

// Employee-only routes. Re-reads the row on every request so that blocking an
// employee immediately invalidates a token they are already holding.
async function employeeOnly(req, res, next) {
  try {
    if (req.user?.role !== ROLES.EMPLOYEE) {
      return res.status(403).json({ message: "Employee access required" });
    }

    const employee = await EmployeeModel.findById(req.user.id);

    if (!employee) {
      return res.status(401).json({ message: "Employee account no longer exists" });
    }

    if (employee.is_blocked) {
      return res.status(403).json({
        message: "Your account has been blocked. Please contact the admin.",
      });
    }

    // The temporary password the admin read out loud is not a working
    // credential for the counter. The frontend redirects to the profile screen,
    // but a redirect is not a control - without this check the whole employee
    // API was reachable with a password that had been spoken aloud and written
    // on paper.
    if (employee.must_change_password && !isAllowedOnTempPassword(req)) {
      return res.status(403).json({
        message: "Please choose your own password before using the portal.",
        mustChangePassword: true,
      });
    }

    req.employee = employee;
    next();
  } catch (error) {
    console.error("employeeOnly failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// Customer-only routes (their own purchase history). Same shape as
// employeeOnly: the row is re-read every request so deactivating a customer
// takes effect at once, not whenever their token happens to expire.
async function userOnly(req, res, next) {
  try {
    if (req.user?.role !== ROLES.USER) {
      return res.status(403).json({ message: "User access required" });
    }

    const user = await UserModel.findById(req.user.id);

    if (!user) {
      return res.status(401).json({ message: "This account no longer exists" });
    }

    if (!user.is_active) {
      return res.status(403).json({
        message: "Your account has been deactivated. Please contact the admin.",
      });
    }

    req.account = user;
    next();
  } catch (error) {
    console.error("userOnly failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// The profile routes are open to every kind of account, so they cannot use any
// of the role guards above - and for a long time they used `protect` alone,
// which verifies the token's signature and never looks at the database. That
// meant deactivating an account did not revoke it there: a locked-out user
// could still read their profile, change their email, and change the password
// they would use once somebody turned the account back on.
//
// This is the missing half of `protect` for those routes: whoever the token
// says it is, look them up and check they are still allowed in.
async function accountIsActive(req, res, next) {
  try {
    const { role, id } = req.user || {};

    if (role === ROLES.EMPLOYEE) {
      const employee = await EmployeeModel.findById(id);

      if (!employee) {
        return res.status(401).json({ message: "This account no longer exists" });
      }
      if (employee.is_blocked) {
        return res.status(403).json({
          message: "Your account has been blocked. Please contact the admin.",
        });
      }

      req.employee = employee;
      return next();
    }

    const model = modelForRole(role);
    // A role with no account table - an old or tampered token. The controllers
    // answer 404 for this, so let them.
    if (!model) return next();

    const account = await model.findById(id);

    if (!account) {
      return res.status(401).json({ message: "This account no longer exists" });
    }

    if (!account.is_active) {
      return res.status(403).json({
        message: "Your account has been deactivated. Please contact the admin.",
      });
    }

    req.account = account;
    next();
  } catch (error) {
    console.error("accountIsActive failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

module.exports = {
  ROLES,
  PANEL_ROLES,
  protect,
  accountIsActive,
  adminOnly,
  mainAdminOnly,
  panelReadAccess,
  panelCashAccess,
  blockSubAdminWrites,
  employeeOnly,
  userOnly,
};
