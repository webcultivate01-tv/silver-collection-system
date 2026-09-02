// Catches any error thrown/passed from controllers and returns a
// consistent JSON response instead of an HTML stack trace.

function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
}

// Anything a controller raised on purpose carries a status below 500 and a
// message written for a person to read, so that message is safe to send back.
// Anything else is an exception we didn't plan for - a driver error, a
// TypeError - and its message is written for a developer: it names tables,
// columns, offending values and library internals. Those go to the log, and
// the client gets a generic line.
const GENERIC_MESSAGE = "Something went wrong on the server";

function errorHandler(err, req, res, next) {
  const status = err.statusCode || err.status || 500;
  const deliberate = status < 500 && err.message;

  // Logged in full either way, so nothing is lost by not sending it.
  console.error(`[${req.method} ${req.originalUrl}]`, err);

  res.status(status).json({
    message: deliberate ? err.message : GENERIC_MESSAGE,
  });
}

module.exports = { notFound, errorHandler };
