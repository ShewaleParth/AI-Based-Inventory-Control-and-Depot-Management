const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/env');

// ─── Access Token (15 minutes) ───────────────────────────────────────────────
// Short-lived, sent as Bearer header. Stored in memory (React state) on frontend.

const generateAccessToken = (userId) => {
  if (!config.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  return jwt.sign({ userId }, config.JWT_SECRET, { expiresIn: '15m' });
};

const verifyAccessToken = (token) => {
  try {
    if (!config.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
    return jwt.verify(token, config.JWT_SECRET);
  } catch {
    return null;
  }
};

// ─── Refresh Token (7 days) ───────────────────────────────────────────────────
// Long-lived, stored in httpOnly cookie + tracked in MongoDB for revocation.
// Each refresh token has a unique jti (JWT ID) so individual tokens can be revoked.

const REFRESH_TOKEN_TTL_DAYS = 7;
const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

const generateRefreshToken = (userId) => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error('JWT_REFRESH_SECRET is not configured');
  const jti = uuidv4(); // unique token ID for revocation
  const token = jwt.sign({ userId, jti }, secret, { expiresIn: '7d' });
  return { token, jti };
};

const verifyRefreshToken = (token) => {
  try {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) throw new Error('JWT_REFRESH_SECRET is not configured');
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
};

// ─── MongoDB-based token helpers ──────────────────────────────────────────────
// No Redis required. Uses the RefreshToken model with a MongoDB TTL index.

/**
 * Persist a refresh token in MongoDB.
 */
async function storeRefreshToken(userId, jti) {
  try {
    const RefreshToken = require('../models/RefreshToken');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    // Upsert in case of rare duplicate (rotation race condition)
    await RefreshToken.findOneAndUpdate(
      { jti },
      { userId, jti, expiresAt },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.warn('Could not store refresh token in MongoDB:', err.message);
  }
}

/**
 * Check if a refresh token is still valid in MongoDB (not revoked, not expired).
 */
async function isRefreshTokenValid(userId, jti) {
  try {
    const RefreshToken = require('../models/RefreshToken');
    const record = await RefreshToken.findOne({
      jti,
      userId,
      expiresAt: { $gt: new Date() }, // not yet expired
    });
    return !!record;
  } catch (err) {
    // If DB unavailable, reject to be safe (don't allow expired sessions through)
    console.warn('Could not validate refresh token in MongoDB:', err.message);
    return false;
  }
}

/**
 * Revoke a specific refresh token (single-device logout).
 */
async function revokeRefreshToken(userId, jti) {
  try {
    const RefreshToken = require('../models/RefreshToken');
    await RefreshToken.deleteOne({ jti, userId });
  } catch (err) {
    console.warn('Could not revoke refresh token in MongoDB:', err.message);
  }
}

/**
 * Revoke ALL refresh tokens for a user (force logout everywhere).
 */
async function revokeAllRefreshTokens(userId) {
  try {
    const RefreshToken = require('../models/RefreshToken');
    await RefreshToken.deleteMany({ userId });
  } catch (err) {
    console.warn('Could not revoke all refresh tokens in MongoDB:', err.message);
  }
}

// ─── Cookie helper ────────────────────────────────────────────────────────────

/**
 * Standard options for the refresh token httpOnly cookie.
 * httpOnly: JS cannot read it → safe from XSS
 * path: '/' → cookie is sent on ALL requests, ensuring it reaches /api/v1/auth/refresh
 */
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: REFRESH_TOKEN_TTL_MS, // ms
  path: '/', // Send cookie on ALL routes — required so the browser sends it on /api/v1/auth/refresh
};

// ─── Backward-compatible aliases ──────────────────────────────────────────────
const generateToken = generateAccessToken;
const verifyToken = verifyAccessToken;

module.exports = {
  // Access token
  generateToken,
  verifyToken,
  generateAccessToken,
  verifyAccessToken,
  // Refresh token
  generateRefreshToken,
  verifyRefreshToken,
  // MongoDB helpers (drop-in replacement for Redis helpers)
  storeRefreshToken,
  isRefreshTokenValid,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  // Cookie config
  REFRESH_COOKIE_OPTIONS,
};
