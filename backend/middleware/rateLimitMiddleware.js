// Rate limiting.
//
// There was none anywhere in the application. That mattered most on the six
// authentication routes: unlimited password attempts against seeded, widely
// documented credentials, and unlimited guesses at a six-digit reset code.
// bcrypt at cost 10 also makes the login route expensive for the SERVER, so an
// unthrottled login is a cheap way to exhaust a ten-connection pool.
//
// Two buckets: a strict one for anything that authenticates, and a loose one
// over the rest of the API as a backstop.

const rateLimit = require("express-rate-limit");

// Disabled under test: the suite deliberately fires dozens of failed logins in
// a row to prove the OTP attempt counter works, and would trip its own limiter.
const ENABLED = process.env.NODE_ENV !== "test" && process.env.DISABLE_RATE_LIMIT !== "true";

const passthrough = (req, res, next) => next();

function limiter({ windowMs, max, message }) {
  if (!ENABLED) return passthrough;

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // The API answers in JSON everywhere else; a limiter that returns HTML
    // would break the frontend's error handling.
    handler: (req, res) => res.status(429).json({ message }),
  });
}

// Signing in, requesting a reset code, and spending one.
const authLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many attempts. Please wait a few minutes and try again.",
});

// The public enquiry form. Its own bucket rather than the auth one: they are
// both strict, but sharing would mean a few enquiries from an office network
// left nobody there able to sign in. An hour is long enough that a spam script
// gets very little out of it, and nobody writing in good faith sends six.
const enquiryLimiter = limiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "Too many enquiries from this connection. Please try again later, or call us.",
});

// Everything else. Generous enough that no ordinary session notices it.
const apiLimiter = limiter({
  windowMs: 60 * 1000,
  max: 300,
  message: "Too many requests. Please slow down.",
});

module.exports = { authLimiter, enquiryLimiter, apiLimiter };
