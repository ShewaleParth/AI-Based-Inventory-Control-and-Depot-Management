const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Depot = require('../models/Depot');
const Transaction = require('../models/Transaction');
const DepotAssignment = require('../models/DepotAssignment');
const { createStockAlert } = require('../utils/alertHelpers');
const { requirePermission, can } = require('../middleware/permissions');
const { paginate } = require('../utils/queryBuilder');
const { executeTransfer } = require('../services/transferService');

/**
 * Helper: Check if a non-admin user has write access to a specific depot
 */
async function checkDepotWriteAccess(userId, userRole, depotId, organizationId) {
  // Viewer can never write — blocked even before reaching this function
  // Admin and Manager bypass depot assignment checks
  if (userRole === 'admin' || userRole === 'manager') return { allowed: true };

  const assignment = await DepotAssignment.findOne({
    userId,
    depotId,
    organizationId
  });

  if (!assignment) {
    return { allowed: false, message: 'You do not have write access to this depot. Contact your admin.' };
  }

  return { allowed: true, permissions: assignment.permissions };
}

// GET all transactions
router.get('/', async (req, res, next) => {
  try {
    const { depotId, productId, type, startDate, endDate, ...restQuery } = req.query;

    const query = { userId: req.organizationId, ...restQuery };

    // Convert generic query aliases to actual schema queries
    if (depotId) {
      query.$or = [{ toDepotId: depotId }, { fromDepotId: depotId }];
    }
    if (productId) query.productId = productId;
    if (type) query.transactionType = type;
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const result = await paginate(Transaction, query);

    // Provide the expected payload while supporting pagination
    res.json({
      transactions: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

// POST - Stock In (Add inventory) — STAFF, MANAGER, ADMIN only
router.post('/stock-in', requirePermission('transfers:create'), async (req, res, next) => {
  try {
    const { productId, quantity, depotId, reason, notes } = req.body;

    if (!productId || !quantity || !depotId) {
      return res.status(400).json({ message: 'Product, quantity, and depot are required' });
    }

    // Check depot write access
    const accessCheck = await checkDepotWriteAccess(req.userId, req.userRole, depotId, req.organizationId);
    if (!accessCheck.allowed) {
      return res.status(403).json({ message: accessCheck.message });
    }

    // Check specific permission
    if (accessCheck.permissions && !accessCheck.permissions.canStockIn) {
      return res.status(403).json({ message: 'You do not have stock-in permission for this depot' });
    }

    const product = await Product.findOne({ _id: productId, userId: req.organizationId });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const depot = await Depot.findOne({ _id: depotId, userId: req.organizationId });
    if (!depot) {
      return res.status(404).json({ message: 'Depot not found' });
    }

    const previousStock = product.stock;

    // Update or add depot distribution
    const depotDistIndex = product.depotDistribution.findIndex(
      d => d.depotId.toString() === depotId
    );

    if (depotDistIndex >= 0) {
      product.depotDistribution[depotDistIndex].quantity += parseInt(quantity);
      product.depotDistribution[depotDistIndex].lastUpdated = new Date();
    } else {
      product.depotDistribution.push({
        depotId: depot._id,
        depotName: depot.name,
        quantity: parseInt(quantity),
        lastUpdated: new Date()
      });
    }

    await product.save();

    const newStock = product.stock;

    // Update depot
    const depotProductIndex = depot.products.findIndex(
      p => p.productId.toString() === productId
    );

    if (depotProductIndex >= 0) {
      depot.products[depotProductIndex].quantity += parseInt(quantity);
      depot.products[depotProductIndex].lastUpdated = new Date();
    } else {
      depot.products.push({
        productId: product._id,
        productName: product.name,
        productSku: product.sku,
        quantity: parseInt(quantity),
        lastUpdated: new Date()
      });
    }

    depot.currentUtilization += parseInt(quantity);
    depot.itemsStored = depot.products.length;
    await depot.save();

    // Create transaction record
    const transaction = new Transaction({
      userId: req.organizationId,
      productId: product._id,
      productName: product.name,
      productSku: product.sku,
      transactionType: 'stock-in',
      quantity: parseInt(quantity),
      toDepot: depot.name,
      toDepotId: depot._id,
      previousStock,
      newStock,
      reason: reason || 'Stock replenishment',
      notes: notes || '',
      performedBy: req.userRole === 'admin' ? 'Admin' : 'Employee'
    });

    await transaction.save();
    await createStockAlert(product, req.organizationId);

    res.status(201).json({
      message: 'Stock added successfully',
      transaction,
      product: {
        id: product._id,
        stock: product.stock,
        status: product.status
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST - Stock Out (Remove inventory) — STAFF, MANAGER, ADMIN only
router.post('/stock-out', requirePermission('transfers:create'), async (req, res, next) => {
  try {
    const { productId, quantity, depotId, reason, notes } = req.body;

    if (!productId || !quantity || !depotId) {
      return res.status(400).json({ message: 'Product, quantity, and depot are required' });
    }

    // Check depot write access
    const accessCheck = await checkDepotWriteAccess(req.userId, req.userRole, depotId, req.organizationId);
    if (!accessCheck.allowed) {
      return res.status(403).json({ message: accessCheck.message });
    }

    if (accessCheck.permissions && !accessCheck.permissions.canStockOut) {
      return res.status(403).json({ message: 'You do not have stock-out permission for this depot' });
    }

    const product = await Product.findOne({ _id: productId, userId: req.organizationId });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const depot = await Depot.findOne({ _id: depotId, userId: req.organizationId });
    if (!depot) {
      return res.status(404).json({ message: 'Depot not found' });
    }

    // Check if enough stock in depot
    const depotDistIndex = product.depotDistribution.findIndex(
      d => d.depotId.toString() === depotId
    );

    if (depotDistIndex < 0 || product.depotDistribution[depotDistIndex].quantity < parseInt(quantity)) {
      return res.status(400).json({ message: 'Insufficient stock in this depot' });
    }

    const previousStock = product.stock;

    // Validate total stock BEFORE mutating — prevents saving negative stock to MongoDB
    const newStock = previousStock - parseInt(quantity);
    if (newStock < 0) {
      return res.status(400).json({ message: 'Insufficient total stock' });
    }

    product.depotDistribution[depotDistIndex].quantity -= parseInt(quantity);
    product.depotDistribution[depotDistIndex].lastUpdated = new Date();

    if (product.depotDistribution[depotDistIndex].quantity === 0) {
      product.depotDistribution.splice(depotDistIndex, 1);
    }

    await product.save();

    // Update depot
    const depotProductIndex = depot.products.findIndex(
      p => p.productId.toString() === productId
    );

    if (depotProductIndex >= 0) {
      depot.products[depotProductIndex].quantity -= parseInt(quantity);
      depot.products[depotProductIndex].lastUpdated = new Date();

      if (depot.products[depotProductIndex].quantity === 0) {
        depot.products.splice(depotProductIndex, 1);
      }
    }

    depot.currentUtilization -= parseInt(quantity);
    depot.itemsStored = depot.products.length;
    await depot.save();

    // Create transaction record
    const transaction = new Transaction({
      userId: req.organizationId,
      productId: product._id,
      productName: product.name,
      productSku: product.sku,
      transactionType: 'stock-out',
      quantity: parseInt(quantity),
      fromDepot: depot.name,
      fromDepotId: depot._id,
      previousStock,
      newStock,
      reason: reason || 'Sale',
      notes: notes || '',
      performedBy: req.userRole === 'admin' ? 'Admin' : 'Employee'
    });

    await transaction.save();
    await createStockAlert(product, req.organizationId);

    res.status(201).json({
      message: 'Stock removed successfully',
      transaction,
      product: {
        id: product._id,
        stock: product.stock,
        status: product.status
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST - Transfer stock between depots — STAFF, MANAGER, ADMIN only
router.post('/transfer', requirePermission('transfers:create'), async (req, res, next) => {
  try {
    const { productId, quantity, fromDepotId, toDepotId, reason, notes } = req.body;

    // Check write access for source depot (must have transfer permission)
    const accessCheck = await checkDepotWriteAccess(req.userId, req.userRole, fromDepotId, req.organizationId);
    if (!accessCheck.allowed) {
      return res.status(403).json({
        message: 'You do not have access to transfer from this depot. Please create a stock request instead.'
      });
    }

    if (accessCheck.permissions && !accessCheck.permissions.canTransfer) {
      return res.status(403).json({ message: 'You do not have transfer permission for this depot' });
    }

    // executeTransfer natively handles all validations and MongoDB transaction requirements
    const result = await executeTransfer({
      productId,
      fromDepotId,
      toDepotId,
      quantity: parseInt(quantity),
      userId: req.organizationId,
      notes: notes || reason || 'Stock transfer',
    });

    const product = await Product.findById(productId);

    res.status(201).json({
      message: 'Stock transferred successfully',
      transaction: result,
      product: {
        id: product._id,
        stock: product.stock,
        depotDistribution: product.depotDistribution
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST - Generate live activity (for testing/demo purposes)
router.post('/generate-activity', async (req, res, next) => {
  try {
    const { days = 7, transactionsPerDay = 7 } = req.body;

    const products = await Product.find({ userId: req.organizationId });
    const depots = await Depot.find({ userId: req.organizationId });

    if (products.length === 0 || depots.length === 0) {
      return res.status(400).json({
        message: 'No products or depots found. Please add products and depots first.'
      });
    }

    const transactions = [];
    const now = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(now.getDate() - i);

      for (let j = 0; j < transactionsPerDay; j++) {
        const product = products[Math.floor(Math.random() * products.length)];
        const type = ['stock-in', 'stock-out', 'transfer'][Math.floor(Math.random() * 3)];
        const quantity = Math.floor(Math.random() * 10) + 1;

        const txDate = new Date(date);
        txDate.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));

        const tx = {
          userId: req.organizationId,
          productId: product._id,
          productSku: product.sku,
          productName: product.name,
          transactionType: type,
          quantity: quantity,
          timestamp: txDate,
          previousStock: product.stock,
          newStock: product.stock,
          performedBy: 'System',
          reason: 'Generated activity'
        };

        if (type === 'transfer' && depots.length >= 2) {
          tx.fromDepot = depots[0].name;
          tx.fromDepotId = depots[0]._id;
          tx.toDepot = depots[1].name;
          tx.toDepotId = depots[1]._id;
        } else if (type === 'stock-in') {
          const depot = depots[Math.floor(Math.random() * depots.length)];
          tx.toDepot = depot.name;
          tx.toDepotId = depot._id;
          tx.newStock = product.stock + quantity;
        } else {
          const depot = depots[Math.floor(Math.random() * depots.length)];
          tx.fromDepot = depot.name;
          tx.fromDepotId = depot._id;
          tx.newStock = Math.max(0, product.stock - quantity);
        }

        transactions.push(tx);
      }
    }

    await Transaction.insertMany(transactions);

    res.json({
      message: `Successfully generated ${transactions.length} live transactions`,
      count: transactions.length,
      days: days,
      transactionsPerDay: transactionsPerDay
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
