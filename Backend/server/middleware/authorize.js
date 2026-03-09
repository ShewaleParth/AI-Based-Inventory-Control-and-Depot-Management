/**
 * Role-based authorization middleware
 * Now delegates to the central permissions module.
 * Import and usage remain unchanged for existing code.
 *
 * Usage: authorize('admin') or authorize('admin', 'manager')
 * Must be used AFTER authenticateToken middleware
 */
const { authorize } = require('./permissions');

module.exports = authorize;
