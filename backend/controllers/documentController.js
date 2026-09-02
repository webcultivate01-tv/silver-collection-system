// Serving uploaded files.
//
// These used to be handed to express.static, which meant the entire uploads
// tree was public: every API response masks an Aadhaar number down to its last
// four digits, and meanwhile the scan of the card itself sat at
//
//   /uploads/employees/ramesh-sharma/aadhaar-front-1723456789012.jpg
//
// readable by anyone who guessed it - a path built from the person's own name,
// with a millisecond timestamp as its only secret.
//
// Now every file goes through this: the caller must be signed in, and must be
// somebody entitled to that particular file. The rule is deliberately narrow:
//
//   admin / sub-admin  any file (they run the panel and already see the
//                      unmasked records these belong to)
//   employee           their own documents, and those of users they registered
//   user               their own documents only
//
// A file nobody's row refers to is a 404 whoever asks - an orphan left behind
// by an old upload should not be readable just because it is still on disk.
//
// The token may arrive in the Authorization header or as ?token=, because an
// <img> tag cannot set a header. That does put the token in a URL, so these
// URLs should not be pasted around; it is a large improvement on no
// authentication at all, and signed short-lived URLs would be the next step.

const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

const { pool } = require("../config/db");
const { ROLES } = require("../middleware/authMiddleware");

const UPLOADS_ROOT = path.join(__dirname, "..", "uploads");

// Columns that can hold a public file path, per table.
const EMPLOYEE_FILE_COLUMNS = ["profile_photo", "aadhaar_front", "aadhaar_back", "pan_front", "pan_back"];
const USER_FILE_COLUMNS = ["profile_image", "aadhaar_front", "aadhaar_back", "pan_front", "pan_back"];

function anyColumnMatches(columns) {
  return columns.map((column) => `${column} = ?`).join(" OR ");
}

// Which row, if any, this file belongs to. Returns { kind, row } or null.
async function ownerOf(publicPath) {
  const employeeParams = EMPLOYEE_FILE_COLUMNS.map(() => publicPath);
  const [employees] = await pool.query(
    `SELECT id FROM employees WHERE ${anyColumnMatches(EMPLOYEE_FILE_COLUMNS)} LIMIT 1`,
    employeeParams
  );
  if (employees[0]) return { kind: "employee", row: employees[0] };

  const userParams = USER_FILE_COLUMNS.map(() => publicPath);
  const [users] = await pool.query(
    `SELECT id, created_by_employee_id FROM users WHERE ${anyColumnMatches(USER_FILE_COLUMNS)} LIMIT 1`,
    userParams
  );
  if (users[0]) return { kind: "user", row: users[0] };

  // The admin and sub-admin profile photos, which live loose in uploads/.
  for (const [table, kind] of [["admins", "admin"], ["sub_admins", "subadmin"]]) {
    const [rows] = await pool.query(
      `SELECT id FROM ${table} WHERE profile_image = ? LIMIT 1`,
      [publicPath]
    );
    if (rows[0]) return { kind, row: rows[0] };
  }

  return null;
}

function maySee(viewer, owner) {
  // The panel sees the unmasked records these documents belong to already.
  if (viewer.role === ROLES.ADMIN || viewer.role === ROLES.SUB_ADMIN) return true;

  if (viewer.role === ROLES.EMPLOYEE) {
    if (owner.kind === "employee") return owner.row.id === viewer.id;
    // A user they registered. Ownership is the same rule
    // employeeUserController applies to the record itself.
    if (owner.kind === "user") return owner.row.created_by_employee_id === viewer.id;
    return false;
  }

  if (viewer.role === ROLES.USER) {
    return owner.kind === "user" && owner.row.id === viewer.id;
  }

  return false;
}

// The token, from the header or the query string.
function viewerFrom(req) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : req.query.token;

  if (!token) return null;

  try {
    return jwt.verify(String(token), process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

// "/uploads/user/a/b/c.jpg" -> the file on this machine, or null if the path
// tries to leave the uploads directory.
function resolveOnDisk(publicPath) {
  const relative = publicPath.replace(/^\/uploads\//, "");
  const target = path.resolve(UPLOADS_ROOT, relative);

  // path.resolve collapses "..", so this catches traversal after the fact
  // rather than trusting the string.
  if (!target.startsWith(path.resolve(UPLOADS_ROOT) + path.sep)) return null;

  return target;
}

// @route GET /uploads/*
async function serveDocument(req, res) {
  try {
    const viewer = viewerFrom(req);

    if (!viewer) {
      return res.status(401).json({ message: "Not authorized to view this file" });
    }

    // req.path here is the part after the /uploads mount, so put it back on -
    // the database stores the full public path.
    const publicPath = `/uploads${req.path}`;
    const owner = await ownerOf(publicPath);

    if (!owner) {
      return res.status(404).json({ message: "File not found" });
    }

    if (!maySee(viewer, owner)) {
      return res.status(403).json({ message: "Not authorized to view this file" });
    }

    const target = resolveOnDisk(publicPath);

    if (!target || !fs.existsSync(target)) {
      return res.status(404).json({ message: "File not found" });
    }

    // These are private documents: no shared cache should keep a copy, and no
    // browser should sniff them into something executable.
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("X-Content-Type-Options", "nosniff");

    res.sendFile(target);
  } catch (error) {
    console.error("serveDocument failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

module.exports = { serveDocument, ownerOf, maySee };
