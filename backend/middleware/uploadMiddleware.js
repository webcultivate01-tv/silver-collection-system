// Receives the signed-in account's own profile photo (PUT /api/profile/image).
//
// The file is held in memory rather than written straight into uploads/,
// because where it belongs depends on who is uploading it: a user registered
// from the employee panel has a documents folder of their own and their photo
// goes in there, beside their Aadhaar and PAN scans. controllers/
// profileController.js decides; this only checks the file is an image we accept
// and isn't too big.
//
// Same rules as every other upload in the app - JPG, PNG or WebP up to 50KB -
// so a photo the profile screens say they will take is a photo the server
// actually takes.

const multer = require("multer");
const { EXTENSION_BY_MIME } = require("../utils/employeeFiles");

const MAX_FILE_SIZE = 50 * 1024;

const receivePhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter(req, file, cb) {
    if (!EXTENSION_BY_MIME[file.mimetype]) {
      return cb(new Error("Your photo must be a JPG, PNG or WebP image"));
    }
    cb(null, true);
  },
}).single("profileImage");

// Multer rejects with its own error type; turn that into the same JSON shape
// the rest of the API uses instead of letting it fall through as a 500.
function uploadProfilePhoto(req, res, next) {
  receivePhoto(req, res, (err) => {
    if (!err) return next();

    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Your photo must be 50KB or smaller"
        : err.code === "LIMIT_UNEXPECTED_FILE"
          ? "Unexpected file upload"
          : err.message;

    res.status(400).json({ message });
  });
}

module.exports = uploadProfilePhoto;
