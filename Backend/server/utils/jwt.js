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
// Long-lived, stored in httpOnly cookie + tracked in Redis for revocation.
// Each refresh token has a unique jti (JWT ID) so individual tokens can be revoked.

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

// ─── Redis helpers ────────────────────────────────────────────────────────────

const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * Persist a refresh token in Redis.
 * Key: refresh:<userId>:<jti>
 */
async function storeRefreshToken(userId, jti) {
  try {
    const { cache } = require('../config/redis');
    await cache.set(`refresh:${userId}:${jti}`, '1', REFRESH_TOKEN_TTL);
  } catch (err) {
    console.warn('Could not store refresh token in Redis:', err.message);
  }
}

/**
 * Check if a refresh token is still valid in Redis (not revoked).
 */
async function isRefreshTokenValid(userId, jti) {
  try {
    const { cache } = require('../config/redis');
    return await cache.exists(`refresh:${userId}:${jti}`);
  } catch {
    // If Redis is unavailable, allow the token (graceful degradation)
    return true;
  }
}

/**
 * Revoke a specific refresh token (logout).
 */
async function revokeRefreshToken(userId, jti) {
  try {
    const { cache } = require('../config/redis');
    await cache.del(`refresh:${userId}:${jti}`);
  } catch (err) {
    console.warn('Could not revoke refresh token in Redis:', err.message);
  }
}

/**
 * Revoke ALL refresh tokens for a user (force logout everywhere).
 */
async function revokeAllRefreshTokens(userId) {
  try {
    const { cache } = require('../config/redis');
    await cache.deletePattern(`refresh:${userId}:*`);
  } catch (err) {
    console.warn('Could not revoke all refresh tokens in Redis:', err.message);
  }
}

// ─── Cookie helper ────────────────────────────────────────────────────────────

/**
 * Standard options for the refresh token httpOnly cookie.
 * httpOnly: JS cannot read it → safe from XSS
 * sameSite: 'lax' works for same-site; use 'none' + secure if cross-origin
 */
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: REFRESH_TOKEN_TTL * 1000, // ms
  path: '/api/v1/auth', // only sent to auth routes
};

// ─── Backward-compatible alias ────────────────────────────────────────────────
// Existing code that calls generateToken / verifyToken continues to work.
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
  // Redis helpers
  storeRefreshToken,
  isRefreshTokenValid,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  // Cookie config
  REFRESH_COOKIE_OPTIONS,
};
