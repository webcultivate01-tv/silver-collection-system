// A user's documents are kept on this server's own disk, filed under the
// employee who registered them:
//
//   backend/uploads/user/<employee-folder>/<user-folder>/profile-photo-<stamp>.jpg
//                                                       /aadhaar-front-<stamp>.jpg
//                                                       /aadhaar-back-<stamp>.jpg
//                                                       /pan-front-<stamp>.jpg
//
// So every employee has one folder holding the data of the users belonging to
// them, e.g. uploads/user/ramesh-sharma/amit-patel/.
//
// `users.folder_name` stores the "<employee-folder>/<user-folder>" part
// ("ramesh-sharma/amit-patel") and the database keeps each file's public path
// ("/uploads/user/ramesh-sharma/amit-patel/pan-front-1723.jpg"), which the
// frontend prefixes with the API origin.
//
// A user's folder is chosen once, when they are registered, and never moves -
// not when the user is renamed and not when their employee is. Moving it would
// invalidate every stored path for no gain, so the folder simply keeps the name
// it was created with.

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

// Uploading a user's documents uses the same image rules and the same
// name-to-folder slugging as an employee's.
const { EXTENSION_BY_MIME, slugify } = require("./employeeFiles");

const UPLOADS_ROOT = path.join(__dirname, "..", "uploads");
const USERS_ROOT = path.join(UPLOADS_ROOT, "user");

// field   -> multipart field name posted by the employee panel
// column  -> users column that stores the saved path
// baseName-> file name on disk inside the user's folder
//
// The profile photo goes into `profile_image`, the column the user portal
// already reads, rather than a second photo column. It is the one `optional`
// document: an employee registering somebody at the counter often has no photo
// of them to hand, and the user can add their own later from /user/profile,
// which writes to this same folder and column.
//
// Only the front of the PAN card is collected; the `pan_back` column is left
// alone so scans uploaded before that change are not thrown away.
const USER_DOCUMENTS = [
  {
    field: "profilePhoto",
    column: "profile_image",
    baseName: "profile-photo",
    label: "Profile photo",
    optional: true,
  },
  { field: "aadhaarFront", column: "aadhaar_front", baseName: "aadhaar-front", label: "Aadhaar card (front side)" },
  { field: "aadhaarBack", column: "aadhaar_back", baseName: "aadhaar-back", label: "Aadhaar card (back side)" },
  { field: "panFront", column: "pan_front", baseName: "pan-front", label: "PAN card (front side)" },
];

// "ramesh-sharma/amit-patel" - the value kept in users.folder_name.
function buildUserFolder(employeeFolder, firstName, lastName) {
  const employee = slugify(employeeFolder) || "employee";
  const user = [slugify(firstName), slugify(lastName)].filter(Boolean).join("-") || "user";
  return `${employee}/${user}`;
}

// The two halves of a folder name, slugified again so a stored value can never
// point outside uploads/user/. Returns null when it isn't a proper
// "<employee>/<user>" pair.
function folderParts(folderName) {
  const parts = String(folderName || "").split("/").map(slugify).filter(Boolean);
  return parts.length === 2 ? parts : null;
}

function folderPath(folderName) {
  const parts = folderParts(folderName);
  return parts ? path.join(USERS_ROOT, ...parts) : null;
}

function userFolderExistsOnDisk(folderName) {
  const target = folderPath(folderName);
  return !!target && fs.existsSync(target);
}

// Registration must include every required document - that is all of them bar
// the profile photo. Returns { field: message }, empty when nothing is missing.
function missingUserDocuments(files = {}) {
  const errors = {};

  for (const doc of USER_DOCUMENTS) {
    if (doc.optional) continue;

    if (!files[doc.field]?.[0]) {
      errors[doc.field] = `${doc.label} is required`;
    }
  }

  return errors;
}

// Writes the uploaded buffers into the user's folder and returns the
// { column: publicPath } map to save on their row. Only the fields that were
// actually picked come back, so an edit leaves the rest untouched.
async function saveUserDocuments(folderName, files = {}) {
  const parts = folderParts(folderName);
  const saved = {};

  if (!parts) return saved;

  const uploaded = USER_DOCUMENTS.map((doc) => ({ doc, file: files[doc.field]?.[0] })).filter(
    (entry) => entry.file
  );

  if (uploaded.length === 0) return saved;

  const folder = path.join(USERS_ROOT, ...parts);
  await fsp.mkdir(folder, { recursive: true });

  for (const { doc, file } of uploaded) {
    // The stamp busts the browser cache when a document is replaced.
    const extension = EXTENSION_BY_MIME[file.mimetype] || ".jpg";
    const fileName = `${doc.baseName}-${Date.now()}${extension}`;

    await fsp.writeFile(path.join(folder, fileName), file.buffer);
    saved[doc.column] = `/uploads/user/${parts.join("/")}/${fileName}`;
  }

  return saved;
}

// Used to clean up after a registration that failed halfway.
async function deleteUserFolder(folderName) {
  const target = folderPath(folderName);
  if (!target) return;
  await fsp.rm(target, { recursive: true, force: true }).catch(() => {});
}

// Deletes every user's documents belonging to one employee - the whole
// uploads/user/<employee-folder>/ tree - so nothing is left behind on disk
// once that employee (and the users only they could manage) is gone.
async function deleteEmployeeUsersFolder(employeeFolder) {
  const employee = slugify(employeeFolder);
  if (!employee) return;
  const target = path.join(USERS_ROOT, employee);
  await fsp.rm(target, { recursive: true, force: true }).catch(() => {});
}

module.exports = {
  USER_DOCUMENTS,
  USERS_ROOT,
  buildUserFolder,
  deleteEmployeeUsersFolder,
  deleteUserFolder,
  missingUserDocuments,
  saveUserDocuments,
  userFolderExistsOnDisk,
};
