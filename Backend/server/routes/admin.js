const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Depot = require('../models/Depot');
const DepotAssignment = require('../models/DepotAssignment');
const StockRequest = require('../models/StockRequest');
const Product = require('../models/Product');
const Transaction = require('../models/Transaction');
const { requirePermission } = require('../middleware/permissions');
const { sendOTPEmail } = require('../services/emailService');

// All routes in this file require users:manage permission (ADMIN only)
router.use(requirePermission('users:manage'));

// ============================================================================
// EMPLOYEE MANAGEMENT
// ============================================================================

/**
 * @route   GET /api/admin/employees
 * @desc    List all employees in the organization
 * @access  Admin only
 */
router.get('/employees', async (req, res, next) => {
  try {
    const employees = await User.find({
      organizationId: req.organizationId,
      _id: { $ne: req.userId } // Exclude self (admin)
    }).select('-password -otp -otpExpiry');

    // Get depot assignments for each employee
    const employeesWithAssignments = await Promise.all(
      employees.map(async (emp) => {
        const assignments = await DepotAssignment.find({ userId: emp._id })
          .populate('depotId', 'name location');
        return {
          id: emp._id,
          name: `${emp.first_name} ${emp.last_name}`,
          email: emp.email,
          role: emp.role,
          isVerified: emp.isVerified,
          createdAt: emp.createdAt,
          assignedDepots: assignments.map(a => ({
            assignmentId: a._id,
            depotId: a.depotId?._id || a.depotId,
            depotName: a.depotId?.name || 'Unknown',
            depotLocation: a.depotId?.location || 'Unknown',
            permissions: a.permissions,
            assignedAt: a.assignedAt
          }))
        };
      })
    );

    res.json({ employees: employeesWithAssignments, total: employeesWithAssignments.length });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/admin/employees/invite
 * @desc    Create employee account with optional depot assignment in one step
 * @access  Admin only
 */
router.post('/employees/invite', async (req, res, next) => {
  try {
    const { email, first_name, last_name, role = 'staff', password, depotId } = req.body;

    if (!email || !first_name || !last_name || !password) {
      return res.status(400).json({ message: 'Email, first name, last name, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    if (role === 'admin') {
      return res.status(400).json({ message: 'Cannot create another admin' });
    }

    // Only valid employee roles allowed
    if (!['manager', 'staff', 'viewer'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Must be: manager, staff, or viewer' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'A user with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // Create the employee account
    const newEmployee = new User({
      first_name,
      last_name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: role,
      isVerified: true, // Admin-created users are pre-verified
      organizationId: req.organizationId,
      invitedBy: req.userId,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await newEmployee.save();

    // If a depot was selected, auto-assign it
    let assignedDepot = null;
    if (depotId) {
      const depot = await Depot.findOne({ _id: depotId, userId: req.organizationId });
      if (depot) {
        const assignment = new DepotAssignment({
          userId: newEmployee._id,
          depotId: depot._id,
          organizationId: req.organizationId,
          permissions: {
            canStockIn: true,
            canStockOut: true,
            canTransfer: true,
            canEditDepot: false
          },
          assignedBy: req.userId,
          assignedAt: new Date()
        });
        await assignment.save();
        assignedDepot = { id: depot._id, name: depot.name, location: depot.location };
      }
    }

    res.status(201).json({
      message: `Employee account created successfully${assignedDepot ? ` and assigned to ${assignedDepot.name}` : ''}`,
      employee: {
        id: newEmployee._id,
        name: `${newEmployee.first_name} ${newEmployee.last_name}`,
        email: newEmployee.email,
        role: newEmployee.role,
        assignedDepot
      },
      // Always return credentials so admin can share with employee
      credentials: {
        email: newEmployee.email,
        password: password
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PATCH /api/admin/employees/:id/role
 * @desc    Update employee role
 * @access  Admin only
 */
router.patch('/employees/:id/role', async (req, res, next) => {
  try {
    const { role } = req.body;
    const employeeId = req.params.id;

    if (!['manager', 'staff'].includes(role)) {
      return res.status(400).json({ message: 'Role must be either manager or staff' });
    }

    const employee = await User.findOne({
      _id: employeeId,
      organizationId: req.organizationId
    });

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    employee.role = role;
    employee.updatedAt = new Date();
    await employee.save();

    res.json({ message: 'Employee role updated', role });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/admin/employees/:id
 * @desc    Remove an employee from the organization
 * @access  Admin only
 */
router.delete('/employees/:id', async (req, res, next) => {
  try {
    const employeeId = req.params.id;

    const employee = await User.findOne({
      _id: employeeId,
      organizationId: req.organizationId,
      _id: { $ne: req.userId } // Can't delete yourself
    });

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Remove all depot assignments
    await DepotAssignment.deleteMany({ userId: employeeId });

    // Remove the employee
    await User.deleteOne({ _id: employeeId });

    res.json({ message: 'Employee removed successfully' });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// DEPOT ASSIGNMENT MANAGEMENT
// ============================================================================

/**
 * @route   GET /api/admin/depot-assignments
 * @desc    List all depot assignments in the organization
 * @access  Admin only
 */
router.get('/depot-assignments', async (req, res, next) => {
  try {
    const assignments = await DepotAssignment.find({ organizationId: req.organizationId })
      .populate('userId', 'first_name last_name email role')
      .populate('depotId', 'name location');

    res.json({
      assignments: assignments.map(a => ({
        id: a._id,
        employee: {
          id: a.userId?._id,
          name: a.userId ? `${a.userId.first_name} ${a.userId.last_name}` : 'Unknown',
          email: a.userId?.email
        },
        depot: {
          id: a.depotId?._id,
          name: a.depotId?.name || 'Unknown',
          location: a.depotId?.location
        },
        permissions: a.permissions,
        assignedAt: a.assignedAt
      })),
      total: assignments.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/admin/depot-assignments
 * @desc    Assign a depot to an employee
 * @access  Admin only
 */
router.post('/depot-assignments', async (req, res, next) => {
  try {
    const { userId, depotId, permissions } = req.body;

    if (!userId || !depotId) {
      return res.status(400).json({ message: 'Employee ID and Depot ID are required' });
    }

    // Verify employee belongs to this org
    const employee = await User.findOne({
      _id: userId,
      organizationId: req.organizationId
    });

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found in your organization' });
    }

    // Verify depot belongs to this org
    const depot = await Depot.findOne({
      _id: depotId,
      userId: req.organizationId
    });

    if (!depot) {
      return res.status(404).json({ message: 'Depot not found in your organization' });
    }

    // Check if assignment already exists
    const existing = await DepotAssignment.findOne({ userId, depotId });
    if (existing) {
      // Update permissions if assignment exists
      if (permissions) {
        existing.permissions = { ...existing.permissions.toObject(), ...permissions };
        await existing.save();
        return res.json({ message: 'Depot assignment updated', assignment: existing });
      }
      return res.status(400).json({ message: 'Employee is already assigned to this depot' });
    }

    const assignment = new DepotAssignment({
      userId,
      depotId,
      organizationId: req.organizationId,
      permissions: permissions || {
        canStockIn: true,
        canStockOut: true,
        canTransfer: true,
        canEditDepot: false
      },
      assignedBy: req.userId,
      assignedAt: new Date()
    });

    await assignment.save();

    res.status(201).json({
      message: 'Depot assigned to employee successfully',
      assignment: {
        id: assignment._id,
        userId: assignment.userId,
        depotId: assignment.depotId,
        depotName: depot.name,
        permissions: assignment.permissions
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'This depot is already assigned to this employee' });
    }
    next(error);
  }
});

/**
 * @route   DELETE /api/admin/depot-assignments/:id
 * @desc    Remove a depot assignment
 * @access  Admin only
 */
router.delete('/depot-assignments/:id', async (req, res, next) => {
  try {
    const assignment = await DepotAssignment.findOne({
      _id: req.params.id,
      organizationId: req.organizationId
    });

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    await DepotAssignment.deleteOne({ _id: req.params.id });

    res.json({ message: 'Depot assignment removed successfully' });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// STOCK REQUEST MANAGEMENT
// ============================================================================

/**
 * @route   GET /api/admin/stock-requests
 * @desc    List all stock requests in the organization
 * @access  Admin only
 */
router.get('/stock-requests', async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = { organizationId: req.organizationId };
    if (status) query.status = status;

    const requests = await StockRequest.find(query)
      .populate('requestedBy', 'first_name last_name email')
      .populate('reviewedBy', 'first_name last_name')
      .sort({ createdAt: -1 });

    res.json({
      requests: requests.map(r => ({
        id: r._id,
        requestedBy: {
          id: r.requestedBy?._id,
          name: r.requestedBy ? `${r.requestedBy.first_name} ${r.requestedBy.last_name}` : 'Unknown',
          email: r.requestedBy?.email
        },
        product: {
          id: r.productId,
          name: r.productName,
          sku: r.productSku
        },
        quantity: r.quantity,
        fromDepot: { id: r.fromDepotId, name: r.fromDepotName },
        toDepot: { id: r.toDepotId, name: r.toDepotName },
        reason: r.reason,
        status: r.status,
        reviewedBy: r.reviewedBy ? `${r.reviewedBy.first_name} ${r.reviewedBy.last_name}` : null,
        reviewedAt: r.reviewedAt,
        reviewNotes: r.reviewNotes,
        createdAt: r.createdAt
      })),
      total: requests.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PATCH /api/admin/stock-requests/:id
 * @desc    Approve or reject a stock request
 * @access  Admin only
 */
router.patch('/stock-requests/:id', async (req, res, next) => {
  try {
    const { status, reviewNotes } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be approved or rejected' });
    }

    const request = await StockRequest.findOne({
      _id: req.params.id,
      organizationId: req.organizationId,
      status: 'pending'
    });

    if (!request) {
      return res.status(404).json({ message: 'Pending stock request not found' });
    }

    request.status = status;
    request.reviewedBy = req.userId;
    request.reviewedAt = new Date();
    request.reviewNotes = reviewNotes || '';
    await request.save();

    // If approved, execute the transfer
    if (status === 'approved') {
      try {
        const product = await Product.findById(request.productId);
        const fromDepot = await Depot.findById(request.fromDepotId);
        const toDepot = await Depot.findById(request.toDepotId);

        if (!product || !fromDepot || !toDepot) {
          return res.status(400).json({
            message: 'Stock request approved but transfer failed: product or depot not found'
          });
        }

        // Check sufficient stock in source depot
        const fromDistIndex = product.depotDistribution.findIndex(
          d => d.depotId.toString() === request.fromDepotId.toString()
        );

        if (fromDistIndex < 0 || product.depotDistribution[fromDistIndex].quantity < request.quantity) {
          request.status = 'rejected';
          request.reviewNotes = 'Auto-rejected: Insufficient stock in source depot';
          await request.save();
          return res.status(400).json({ message: 'Insufficient stock in source depot' });
        }

        const previousStock = product.stock;

        // Subtract from source
        product.depotDistribution[fromDistIndex].quantity -= request.quantity;
        product.depotDistribution[fromDistIndex].lastUpdated = new Date();
        if (product.depotDistribution[fromDistIndex].quantity === 0) {
          product.depotDistribution.splice(fromDistIndex, 1);
        }

        // Add to destination
        const toDistIndex = product.depotDistribution.findIndex(
          d => d.depotId.toString() === request.toDepotId.toString()
        );
        if (toDistIndex >= 0) {
          product.depotDistribution[toDistIndex].quantity += request.quantity;
          product.depotDistribution[toDistIndex].lastUpdated = new Date();
        } else {
          product.depotDistribution.push({
            depotId: toDepot._id,
            depotName: toDepot.name,
            quantity: request.quantity,
            lastUpdated: new Date()
          });
        }

        await product.save();

        // Update source depot
        const fromProdIdx = fromDepot.products.findIndex(
          p => p.productId.toString() === request.productId.toString()
        );
        if (fromProdIdx >= 0) {
          fromDepot.products[fromProdIdx].quantity -= request.quantity;
          if (fromDepot.products[fromProdIdx].quantity <= 0) {
            fromDepot.products.splice(fromProdIdx, 1);
          }
        }
        await fromDepot.save();

        // Update destination depot
        const toProdIdx = toDepot.products.findIndex(
          p => p.productId.toString() === request.productId.toString()
        );
        if (toProdIdx >= 0) {
          toDepot.products[toProdIdx].quantity += request.quantity;
        } else {
          toDepot.products.push({
            productId: product._id,
            productName: product.name,
            productSku: product.sku,
            quantity: request.quantity,
            lastUpdated: new Date()
          });
        }
        await toDepot.save();

        // Create transaction record
        const transaction = new Transaction({
          userId: req.organizationId,
          productId: product._id,
          productName: product.name,
          productSku: product.sku,
          transactionType: 'transfer',
          quantity: request.quantity,
          fromDepot: fromDepot.name,
          fromDepotId: fromDepot._id,
          toDepot: toDepot.name,
          toDepotId: toDepot._id,
          previousStock,
          newStock: previousStock, // total stock doesn't change for transfers
          reason: `Approved stock request from ${request.requestedBy}`,
          notes: request.reason,
          performedBy: 'Admin (Stock Request)'
        });
        await transaction.save();

        return res.json({
          message: 'Stock request approved and transfer completed',
          request: { id: request._id, status: 'approved' },
          transfer: { transactionId: transaction._id }
        });
      } catch (transferError) {
        console.error('Transfer execution error:', transferError);
        return res.status(500).json({
          message: 'Stock request approved but transfer failed',
          error: transferError.message
        });
      }
    }

    res.json({
      message: `Stock request ${status}`,
      request: { id: request._id, status }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
