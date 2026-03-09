/**
 * Depot-level access control middleware
 * Checks if the user has write permission for a specific depot.
 * 
 * - Admin: full access to all depots in their organization
 * - Manager/Staff: write access only to assigned depots
 * 
 * Usage: depotAccess('body', 'depotId') — reads depot ID from req.body.depotId
 *        depotAccess('params', 'depotId') — reads depot ID from req.params.depotId
 *        depotAccess('body', 'depotId', 'read') — only checks read access (all org users can read)
 */
const DepotAssignment = require('../models/DepotAssignment');

const depotAccess = (source = 'body', field = 'depotId', accessType = 'write') => {
  return async (req, res, next) => {
    try {
      // Admins have full access to everything
      if (req.userRole === 'admin') {
        return next();
      }

      // For read-only access, all org members can read
      if (accessType === 'read') {
        return next();
      }

      // Get the depot ID from the request
      let depotId;
      if (source === 'body') {
        depotId = req.body[field];
      } else if (source === 'params') {
        depotId = req.params[field];
      } else if (source === 'query') {
        depotId = req.query[field];
      }

      if (!depotId) {
        return res.status(400).json({ message: `Depot ID (${field}) is required` });
      }

      // Check if user has an assignment for this depot
      const assignment = await DepotAssignment.findOne({
        userId: req.userId,
        depotId: depotId,
        organizationId: req.organizationId
      });

      if (!assignment) {
        return res.status(403).json({
          message: 'You do not have write access to this depot. Please request stock from your admin.',
          depotId: depotId
        });
      }

      // Attach assignment permissions to request for downstream use
      req.depotPermissions = assignment.permissions;
      next();
    } catch (error) {
      console.error('Depot access middleware error:', error);
      return res.status(500).json({ message: 'Error checking depot access' });
    }
  };
};

/**
 * Check a specific depot permission (canStockIn, canStockOut, canTransfer, canEditDepot)
 * Must be used AFTER depotAccess middleware
 */
const checkDepotPermission = (permission) => {
  return (req, res, next) => {
    // Admins bypass permission checks
    if (req.userRole === 'admin') {
      return next();
    }

    if (req.depotPermissions && req.depotPermissions[permission] === false) {
      return res.status(403).json({
        message: `You do not have '${permission}' permission for this depot`
      });
    }

    next();
  };
};

module.exports = { depotAccess, checkDepotPermission };
