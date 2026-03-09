/**
 * Central RBAC Permission Matrix
 *
 * Four roles — ordered by privilege level
 *   ADMIN   (level 4) — org owner, full access
 *   MANAGER (level 3) — warehouse manager
 *   STAFF   (level 2) — warehouse staff
 *   VIEWER  (level 1) — read-only (finance team, auditors, etc.)
 */

const ROLES = {
  admin:   { level: 4, label: 'Admin' },
  manager: { level: 3, label: 'Manager' },
  staff:   { level: 2, label: 'Staff' },
  viewer:  { level: 1, label: 'Viewer' },
};

/**
 * Permission matrix — what each role is allowed to do.
 * Lists the minimum role level required for each permission.
 */
const PERMISSIONS = {
  'products:read'    : ['viewer', 'staff', 'manager', 'admin'],
  'products:write'   : ['staff', 'manager', 'admin'],
  'products:delete'  : ['manager', 'admin'],
  'depots:manage'    : ['manager', 'admin'],   // create, edit, delete depots
  'transfers:create' : ['staff', 'manager', 'admin'],
  'reports:export'   : ['manager', 'admin'],
  'users:manage'     : ['admin'],              // employee + assignment management
  'alerts:dismiss'   : ['manager', 'admin'],
};

/**
 * Check if a role has the given permission
 * @param {string} role - user role ('admin' | 'manager' | 'staff' | 'viewer')
 * @param {string} permission - permission key (e.g. 'products:write')
 * @returns {boolean}
 */
function can(role, permission) {
  const allowed = PERMISSIONS[permission];
  if (!allowed) return false;
  return allowed.includes(role);
}

/**
 * Express middleware factory — require a specific permission
 * Usage: router.post('/', requirePermission('products:write'), handler)
 * Must be used AFTER authenticateToken middleware
 */
function requirePermission(permission) {
  return (req, res, next) => {
    const role = req.userRole || 'viewer';

    if (!can(role, permission)) {
      return res.status(403).json({
        message: 'You do not have permission to perform this action',
        required: permission,
        yourRole: role,
      });
    }
    next();
  };
}

/**
 * Express middleware factory — require a specific role or higher level
 * Usage: authorize('admin') or authorize('admin', 'manager')
 * Must be used AFTER authenticateToken middleware
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.userRole) {
      return res.status(500).json({ message: 'Authorization error: user role not set' });
    }
    if (!roles.includes(req.userRole)) {
      return res.status(403).json({
        message: 'You do not have permission to perform this action',
        requiredRole: roles,
        yourRole: req.userRole,
      });
    }
    next();
  };
}

module.exports = { ROLES, PERMISSIONS, can, requirePermission, authorize };
