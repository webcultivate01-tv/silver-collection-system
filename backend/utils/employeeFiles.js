// Employee documents are kept on this server's own disk (no Cloudinary).
// Every employee gets one folder named after them:
//
//   backend/uploads/employees/<firstname>-<lastname>/profile-photo-<stamp>.jpg
//                                                   /aadhaar-front-<stamp>.jpg
//                                                   /aadhaar-back-<stamp>.jpg
//                                                   /pan-front-<stamp>.jpg
//
// The database only stores the public path of each file (e.g.
// "/uploads/employees/ramesh-sharma/pan-front-1723.jpg"), which the frontend
// prefixes with the API origin.

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const UPLOADS_ROOT = path.join(__dirname, "..", "uploads");
const EMPLOYEES_ROOT = path.join(UPLOADS_ROOT, "employees");

// field   -> multipart field name posted by the admin panel
// column  -> employees column that stores the saved path
// baseName-> file name on disk inside the employee's folder
//
// Only the front of the PAN card is asked for; the back side is not collected
// any more. Scans uploaded before that change stay on disk and in `pan_back`,
// they are simply never read.
const DOCUMENTS = [
  { field: "profilePhoto", column: "profile_photo", baseName: "profile-photo", label: "Profile photo" },
  { field: "aadhaarFront", column: "aadhaar_front", baseName: "aadhaar-front", label: "Aadhaar card (front side)" },
  { field: "aadhaarBack", column: "aadhaar_back", baseName: "aadhaar-back", label: "Aadhaar card (back side)" },
  { field: "panFront", column: "pan_front", baseName: "pan-front", label: "PAN card (front side)" },
];

const EXTENSION_BY_MIME = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

// "Ramesh Kumar" -> "ramesh-kumar". Also what keeps the folder name safe to
// join onto a path (no slashes, no dots, no traversal).
function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

// The folder an employee's files live in: "<firstname>-<lastname>".
function buildFolderName(firstName, lastName) {
  const parts = [slugify(firstName), slugify(lastName)].filter(Boolean);
  return parts.join("-") || "employee";
}

function folderPath(folderName) {
  return path.join(EMPLOYEES_ROOT, slugify(folderName));
}

function folderExistsOnDisk(folderName) {
  return fs.existsSync(folderPath(folderName));
}

// "/uploads/employees/x/profile-photo-1.jpg" -> absolute path on this machine.
function diskPathOf(publicPath) {
  const relative = String(publicPath || "").replace(/^\/uploads\//, "");
  if (!relative || relative.includes("..")) return null;
  return path.join(UPLOADS_ROOT, relative);
}

// Writes the uploaded buffers into the employee's folder and returns the
// { column: publicPath } map to save on the row. Only the fields the admin
// actually picked are returned, so an edit can leave the rest untouched.
async function saveDocuments(folderName, files = {}) {
  const safeFolder = slugify(folderName);
  const saved = {};

  const uploaded = DOCUMENTS.map((doc) => ({ doc, file: files[doc.field]?.[0] })).filter(
    (entry) => entry.file
  );

  if (uploaded.length === 0) return saved;

  await fsp.mkdir(folderPath(safeFolder), { recursive: true });

  for (const { doc, file } of uploaded) {
    // The stamp busts the browser cache when a document is replaced.
    const extension = EXTENSION_BY_MIME[file.mimetype] || ".jpg";
    const fileName = `${doc.baseName}-${Date.now()}${extension}`;

    await fsp.writeFile(path.join(folderPath(safeFolder), fileName), file.buffer);
    saved[doc.column] = `/uploads/employees/${safeFolder}/${fileName}`;
  }

  return saved;
}

// Best effort: a leftover file must never break the request that replaced it.
async function removeFile(publicPath) {
  const target = diskPathOf(publicPath);
  if (!target) return;
  await fsp.rm(target, { force: true }).catch(() => {});
}

// Called when an employee is renamed, so the folder keeps matching their name.
// Returns { folderName, paths } for the folder actually in use afterwards, or
// null when the move didn't happen - renaming is a tidiness feature, so the
// caller keeps the old folder rather than failing the whole update.
async function renameFolder(oldFolderName, newFolderName, currentPaths = {}) {
  const oldSlug = slugify(oldFolderName);
  const newSlug = slugify(newFolderName);

  // Without a previous folder there is nothing to move, and an empty name
  // would resolve to the employees root itself.
  if (!oldSlug || !newSlug || oldSlug === newSlug) return null;

  const from = folderPath(oldSlug);
  const to = folderPath(newSlug);

  if (fs.existsSync(from)) {
    await fsp.mkdir(EMPLOYEES_ROOT, { recursive: true });

    try {
      await fsp.rename(from, to);
    } catch {
      // Some filesystems (OneDrive-synced folders, network shares, a different
      // volume) refuse to rename a directory. Copy it across instead.
      try {
        await fsp.cp(from, to, { recursive: true });
      } catch {
        return null;
      }
      await fsp.rm(from, { recursive: true, force: true }).catch(() => {});
    }
  }

  const paths = {};
  for (const doc of DOCUMENTS) {
    const current = currentPaths[doc.column];
    if (!current) continue;
    paths[doc.column] = current.replace(
      `/uploads/employees/${oldSlug}/`,
      `/uploads/employees/${newSlug}/`
    );
  }

  return { folderName: newSlug, paths };
}

async function deleteFolder(folderName) {
  if (!folderName) return;
  await fsp.rm(folderPath(folderName), { recursive: true, force: true }).catch(() => {});
}

module.exports = {
  DOCUMENTS,
  EMPLOYEES_ROOT,
  EXTENSION_BY_MIME,
  buildFolderName,
  deleteFolder,
  folderExistsOnDisk,
  removeFile,
  renameFolder,
  saveDocuments,
  slugify,
};
