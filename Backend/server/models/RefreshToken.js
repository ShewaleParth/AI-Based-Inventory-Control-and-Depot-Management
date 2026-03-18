const mongoose = require('mongoose');

/**
 * RefreshToken — MongoDB-based refresh token store.
 * Replaces Redis for refresh token tracking with TTL-based auto-expiry.
 * Each token is uniquely identified by its jti (JWT ID).
 */
const refreshTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  jti: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  // TTL: MongoDB will auto-delete documents when expiresAt is in the past
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 }, // MongoDB TTL index — auto-removes expired docs
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
