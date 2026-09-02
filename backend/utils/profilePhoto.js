// Where an account's own profile photo is written when it changes it from its
// profile screen (PUT /api/profile/image).
//
// A user registered from the employee panel already keeps every file in one
// folder - uploads/user/<employee>/<user>/ - so their photo goes back into that
// same folder through utils/userFiles.js, next to the Aadhaar and PAN scans the
// employee uploaded. That is handled by saveUserDocuments(); this file covers
// the other case.
//
// The admin and sub-admins have no document folder, so their photo stays a
// loose file directly in uploads/, named the way the old disk-storage upload
// middleware named it.

const fsp = require("fs").promises;
const path = require("path");
const { EXTENSION_BY_MIME } = require("./employeeFiles");

const UPLOADS_ROOT = path.join(__dirname, "..", "uploads");

// The extension comes from the mime type the upload middleware already
// accepted, never from the name the browser sent.
async function saveLooseProfilePhoto(id, file) {
  await fsp.mkdir(UPLOADS_ROOT, { recursive: true });

  const extension = EXTENSION_BY_MIME[file.mimetype] || ".jpg";
  // The stamp busts the browser cache when a photo is replaced.
  const fileName = `user-${id}-${Date.now()}${extension}`;

  await fsp.writeFile(path.join(UPLOADS_ROOT, fileName), file.buffer);

  return `/uploads/${fileName}`;
}

module.exports = { UPLOADS_ROOT, saveLooseProfilePhoto };
