const logger = require('../config/logger');

// ── Typed application error ──────────────────────────
// isOperational = true  → we control this, safe to show to user
// isOperational = false → unexpected bug, show generic message
class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || 'APP_ERROR';
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ── asyncWrap ────────────────────────────────────────
// Wraps an async handler so any thrown error is forwarded
// to Express's next(err) automatically.
// Before:  async (req,res) => { try { ... } catch(e) { next(e) } }
// After:   asyncWrap(async (req,res) => { ... })
const asyncWrap = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ── Global error handler ─────────────────────────────
// MUST be registered LAST in server.js (after all routes)
// MUST have exactly 4 arguments — Express detects this
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';

  // Only expose the real message for operational errors
  const message = err.isOperational
    ? err.message
    : 'An unexpected error occurred';

  // Always log the full error with context
  logger.error({
    code,
    message: err.message,
    stack: err.stack,
    statusCode,
    method: req.method,
    path: req.path,
    userId: req.user?.userId || 'unauthenticated',
    ip: req.ip || req.headers['x-forwarded-for'],
    requestBody: req.body,
  });

  res.status(statusCode).json({ error: message, code });
}

module.exports = { AppError, asyncWrap, errorHandler };
