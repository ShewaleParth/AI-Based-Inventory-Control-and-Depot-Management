/**
 * Client-side permission matrix — mirrors the server-side permissions.js
 *
 * Usage:
 *   import { can, ROLES } from '../utils/permissions';
 *   can('staff', 'products:write')  // → true
 *   can('viewer', 'transfers:create')  // → false
 */

export const ROLES = {
  admin:   { level: 4, label: 'Admin',   color: '#6366f1' },
  manager: { level: 3, label: 'Manager', color: '#f59e0b' },
  staff:   { level: 2, label: 'Staff',   color: '#10b981' },
  viewer:  { level: 1, label: 'Viewer',  color: '#6b7280' },
};

/** Roles selectable when creating an employee (not admin) */
export const EMPLOYEE_ROLES = [
  { value: 'manager', label: 'Manager', description: 'Can manage depots, reports, and dismiss alerts' },
  { value: 'staff',   label: 'Staff',   description: 'Can stock-in/out/transfer on assigned depots' },
  { value: 'viewer',  label: 'Viewer',  description: 'Read-only access — cannot modify any data' },
];

/** Permission matrix — which roles can perform which actions */
export const PERMISSIONS = {
  'products:read'    : ['viewer', 'staff', 'manager', 'admin'],
  'products:write'   : ['staff', 'manager', 'admin'],
  'products:delete'  : ['manager', 'admin'],
  'depots:manage'    : ['manager', 'admin'],
  'transfers:create' : ['staff', 'manager', 'admin'],
  'reports:export'   : ['manager', 'admin'],
  'users:manage'     : ['admin'],
  'alerts:dismiss'   : ['manager', 'admin'],
};

/**
 * Check if a role has the given permission
 * @param {string} role
 * @param {string} permission
 * @returns {boolean}
 */
export function can(role, permission) {
  const allowed = PERMISSIONS[permission];
  if (!allowed) return false;
  return allowed.includes(role);
}

/**
 * Get role metadata (label, color) for a given role string
 */
export function getRoleMeta(role) {
  return ROLES[role] || { level: 0, label: role, color: '#6b7280' };
}
