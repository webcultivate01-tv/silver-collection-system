// Generates a random 6-digit OTP, e.g. "483920", and hashes it for storage.
//
// crypto.randomInt, not Math.random: Math.random is a fast PRNG, not a secure
// one, and its internal state can be recovered from a few observed outputs -
// so somebody able to request OTPs for their own account could predict the one
// issued for somebody else's. This is the code that resets a password, which
// makes it worth the stronger generator.
//
// The value is stored HASHED. It is short-lived and low-entropy, so a slow
// hash would cost more than it is worth on every verification; SHA-256 is
// enough to stop a database backup, a log or a dump from handing over every
// live reset code in plain text.

const crypto = require("crypto");

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(otp) {
  return crypto.createHash("sha256").update(String(otp).trim()).digest("hex");
}

// Compared in constant time, so the comparison itself cannot be timed to
// recover the code digit by digit.
function otpMatches(candidate, storedHash) {
  if (!candidate || !storedHash) return false;

  const a = Buffer.from(hashOtp(candidate));
  const b = Buffer.from(String(storedHash));

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = generateOtp;
module.exports.generateOtp = generateOtp;
module.exports.hashOtp = hashOtp;
module.exports.otpMatches = otpMatches;
