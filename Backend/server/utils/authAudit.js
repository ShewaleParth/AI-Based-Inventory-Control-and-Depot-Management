/**
 * authAudit.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Structured auth-event audit logger.
 *
 * Every authentication event — login, logout, OTP verify, password reset,
 * token refresh, failed attempts — is recorded here with enough context to:
 *   • Detect account takeover patterns
 *   • Satisfy SOC-2 / ISO-27001 audit requirements
 *   • Debug production auth issues without exposing sensitive data
 *
 * Output goes to the same logger used by errorHandler.js so all events land
 * in the same log stream (console / file / cloud — whatever logger is wired up).
 *
 * Usage:
 *   const { auditLog } = require('../utils/authAudit');
 *   auditLog('LOGIN_SUCCESS', { userId, ip, userAgent });
 */

const logger = require('../config/logger');

// ─── Event type constants ─────────────────────────────────────────────────────
const AUTH_EVENTS = {
  // Account lifecycle
  SIGNUP:              'SIGNUP',
  SIGNUP_DUPLICATE:    'SIGNUP_DUPLICATE',

  // OTP
  OTP_SENT:            'OTP_SENT',
  OTP_SUCCESS:         'OTP_SUCCESS',
  OTP_FAILED:          'OTP_FAILED',
  OTP_EXPIRED:         'OTP_EXPIRED',
  OTP_LOCKED:          'OTP_LOCKED',
  OTP_RESENT:          'OTP_RESENT',

  // Login / logout
  LOGIN_SUCCESS:       'LOGIN_SUCCESS',
  LOGIN_FAILED:        'LOGIN_FAILED',
  LOGIN_LOCKED:        'LOGIN_LOCKED',
  LOGIN_UNVERIFIED:    'LOGIN_UNVERIFIED',
  LOGOUT:              'LOGOUT',

  // Token
  TOKEN_REFRESH:       'TOKEN_REFRESH',
  TOKEN_REUSE_ATTACK:  'TOKEN_REUSE_ATTACK',
  TOKEN_INVALID:       'TOKEN_INVALID',
  TOKEN_STALE:         'TOKEN_STALE',   // used after password change

  // Password
  FORGOT_PASSWORD:     'FORGOT_PASSWORD',
  RESET_PASSWORD:      'RESET_PASSWORD',
  PASSWORD_CHANGED:    'PASSWORD_CHANGED',

  // Admin
  EMPLOYEE_CREATED:    'EMPLOYEE_CREATED',
  EMPLOYEE_DELETED:    'EMPLOYEE_DELETED',
  ROLE_CHANGED:        'ROLE_CHANGED',
};

/**
 * Record an auth audit event.
 *
 * @param {string} event    - One of AUTH_EVENTS
 * @param {object} context  - { userId?, email?, ip?, userAgent?, meta? }
 */
function auditLog(event, context = {}) {
  const { userId, email, ip, userAgent, meta } = context;

  // Determine log level: security-sensitive events → warn; normal flow → info
  const WARN_EVENTS = new Set([
    AUTH_EVENTS.LOGIN_FAILED,
    AUTH_EVENTS.LOGIN_LOCKED,
    AUTH_EVENTS.OTP_FAILED,
    AUTH_EVENTS.OTP_LOCKED,
    AUTH_EVENTS.TOKEN_REUSE_ATTACK,
    AUTH_EVENTS.TOKEN_INVALID,
    AUTH_EVENTS.TOKEN_STALE,
  ]);

  const payload = {
    type:      'AUTH_AUDIT',
    event,
    timestamp: new Date().toISOString(),
    userId:    userId    || null,
    email:     email     || null,
    ip:        ip        || null,
    userAgent: userAgent || null,
    ...(meta ? { meta } : {}),
  };

  if (WARN_EVENTS.has(event)) {
    logger.warn(payload);
  } else {
    logger.info(payload);
  }
}

module.exports = { auditLog, AUTH_EVENTS };
