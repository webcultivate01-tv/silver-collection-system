// Receives an employee's or a user's documents - profile photo, Aadhaar front
// and back, PAN front - as multipart form-data.
//
// Files are held in memory and only written to disk once the row has been
// validated and created, so a rejected registration never leaves stray files
// behind. See utils/employeeFiles.js and utils/userFiles.js for where they
// end up.

const multer = require("multer");
const { DOCUMENTS, EXTENSION_BY_MIME } = require("../utils/employeeFiles");
const { USER_DOCUMENTS } = require("../utils/userFiles");

const MAX_FILE_SIZE = 10 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: USER_DOCUMENTS.length },
  fileFilter(req, file, cb) {
    if (!EXTENSION_BY_MIME[file.mimetype]) {
      return cb(new Error("Documents must be JPG, PNG or WebP images"));
    }
    cb(null, true);
  },
});

// A field not listed here is rejected as "unexpected". The two lists ask for
// the same documents but store them in different columns, so they stay apart.
const asFields = (documents) => documents.map((doc) => ({ name: doc.field, maxCount: 1 }));

const receiveEmployeeFiles = upload.fields(asFields(DOCUMENTS));
const receiveUserFiles = upload.fields(asFields(USER_DOCUMENTS));

// Employees editing their own profile may only replace their photo - the ID
// scans stay with the admin. Still `.fields()` (not `.single()`) so req.files
// keeps the shape utils/employeeFiles.js expects.
const receivePhoto = upload.fields([{ name: "profilePhoto", maxCount: 1 }]);

// Multer rejects with its own error type; turn that into the same JSON shape
// the rest of the API uses instead of letting it fall through as a 500.
function handleUpload(receive) {
  return function uploadMiddleware(req, res, next) {
    receive(req, res, (err) => {
      if (!err) return next();

      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "Each document must be 10KB or smaller"
          : err.code === "LIMIT_UNEXPECTED_FILE"
            ? "Unexpected file upload"
            : err.message;

      res.status(400).json({ message });
    });
  };
}

module.exports = {
  uploadEmployeeDocuments: handleUpload(receiveEmployeeFiles),
  uploadEmployeeProfilePhoto: handleUpload(receivePhoto),
  uploadUserDocuments: handleUpload(receiveUserFiles),
};
