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

    // Validate all required fields before any DB access
    if (!productId) {
      return res.status(400).json({ message: 'Product is required for transfer' });
    }
    if (!quantity || parseInt(quantity) <= 0) {
      return res.status(400).json({ message: 'A positive quantity is required for transfer' });
    }
    if (!fromDepotId) {
      return res.status(400).json({ message: 'Source depot (fromDepotId) is required' });
    }
    if (!toDepotId) {
      return res.status(400).json({ message: 'Destination depot (toDepotId) is required' });
    }
    if (fromDepotId === toDepotId) {
      return res.status(400).json({ message: 'Source and destination depots must be different' });
    }

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

// POST - Import transactions from CSV
// Expected CSV columns (case-insensitive):
//   transactionType, productName, productSku, quantity, fromDepot, toDepot, reason, notes, timestamp
router.post('/import-csv', requirePermission('transfers:create'), async (req, res, next) => {
  try {
    const { csvText } = req.body;
    if (!csvText || typeof csvText !== 'string') {
      return res.status(400).json({ message: 'csvText (string) is required in the request body' });
    }

    const lines = csvText.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      return res.status(400).json({ message: 'CSV must have at least a header row and one data row' });
    }

    // Parse headers helper
    const parseCSVLine = (line) => {
      const row = [];
      let current = "";
      let inQuotes = false;
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) {
          row.push(current.trim().replace(/^"|"$/g, ''));
          current = "";
        } else current += char;
      }
      row.push(current.trim().replace(/^"|"$/g, ''));
      return row;
    };

    // Parse headers
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ''));

    const getCol = (row, name) => {
      const idx = headers.indexOf(name);
      return idx >= 0 ? row[idx] : '';
    };

    const products = await Product.find({ userId: req.organizationId });
    const depots   = await Depot.find({ userId: req.organizationId });

    const findProduct = (name, sku) => {
      if (sku) {
        const bySkuExact = products.find(p => p.sku?.toLowerCase() === sku.toLowerCase());
        if (bySkuExact) return bySkuExact;
      }
      if (name) {
        return products.find(p => p.name?.toLowerCase() === name.toLowerCase());
      }
      return null;
    };

    const findDepot = (nameStr) => {
      if (!nameStr) return null;
      return depots.find(d => d.name?.toLowerCase() === nameStr.toLowerCase()) || null;
    };

    const validTypes = ['stock-in', 'stock-out', 'transfer', 'adjustment'];
    const results   = { success: 0, failed: 0, errors: [] };
    const txsToInsert = [];

    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]);
      const rowNum = i + 1;

      try {
        const type       = getCol(row, 'transactiontype') || getCol(row, 'type');
        const pName      = getCol(row, 'productname');
        const pSku       = getCol(row, 'productsku') || getCol(row, 'sku');
        const qty        = parseInt(getCol(row, 'quantity'));
        const fromDepotN = getCol(row, 'fromdepot');
        const toDepotN   = getCol(row, 'todepot');
        const reason     = getCol(row, 'reason') || 'CSV Import';
        const notes      = getCol(row, 'notes') || '';
        const tsRaw      = getCol(row, 'timestamp');

        // Validate type
        if (!validTypes.includes(type)) {
          results.errors.push(`Row ${rowNum}: Unknown transactionType "${type}"`);
          results.failed++;
          continue;
        }

        // Validate quantity
        if (isNaN(qty) || qty <= 0) {
          results.errors.push(`Row ${rowNum}: Invalid quantity "${getCol(row, 'quantity')}"`);
          results.failed++;
          continue;
        }

        // Find product
        const product = findProduct(pName, pSku);
        if (!product) {
          results.errors.push(`Row ${rowNum}: Product not found (name="${pName}", sku="${pSku}")`);
          results.failed++;
          continue;
        }

        const previousStock = product.stock;
        let newStock = previousStock;

        const fromDepot = findDepot(fromDepotN);
        const toDepot   = findDepot(toDepotN);

        // Build transaction doc
        const txDoc = {
          userId:          req.organizationId,
          productId:       product._id,
          productName:     product.name,
          productSku:      product.sku,
          transactionType: type,
          quantity:        qty,
          fromDepot:       fromDepot?.name || fromDepotN || undefined,
          fromDepotId:     fromDepot?._id  || undefined,
          toDepot:         toDepot?.name   || toDepotN   || undefined,
          toDepotId:       toDepot?._id    || undefined,
          previousStock,
          newStock,    // will be patched below
          reason,
          notes,
          performedBy: req.userRole === 'admin' ? 'Admin' : 'Employee',
          timestamp:   tsRaw ? new Date(tsRaw) : new Date()
        };

        // Update stock levels
        if (type === 'stock-in') {
          if (!toDepot) {
            results.errors.push(`Row ${rowNum}: toDepot required for stock-in`);
            results.failed++;
            continue;
          }
          const ddIdx = product.depotDistribution.findIndex(
            d => d.depotId.toString() === toDepot._id.toString()
          );
          if (ddIdx >= 0) {
            product.depotDistribution[ddIdx].quantity += qty;
          } else {
            product.depotDistribution.push({
              depotId: toDepot._id, depotName: toDepot.name, quantity: qty, lastUpdated: new Date()
            });
          }
          await product.save();
          newStock = product.stock;

          // Update depot
          const dpIdx = toDepot.products.findIndex(p => p.productId.toString() === product._id.toString());
          if (dpIdx >= 0) {
            toDepot.products[dpIdx].quantity += qty;
          } else {
            toDepot.products.push({ productId: product._id, productName: product.name, productSku: product.sku, quantity: qty, lastUpdated: new Date() });
          }
          toDepot.currentUtilization += qty;
          toDepot.itemsStored = toDepot.products.length;
          await toDepot.save();

        } else if (type === 'stock-out') {
          if (!fromDepot) {
            results.errors.push(`Row ${rowNum}: fromDepot required for stock-out`);
            results.failed++;
            continue;
          }
          const ddIdx = product.depotDistribution.findIndex(
            d => d.depotId.toString() === fromDepot._id.toString()
          );
          if (ddIdx < 0 || product.depotDistribution[ddIdx].quantity < qty) {
            results.errors.push(`Row ${rowNum}: Insufficient stock in depot "${fromDepotN}"`);
            results.failed++;
            continue;
          }
          product.depotDistribution[ddIdx].quantity -= qty;
          if (product.depotDistribution[ddIdx].quantity === 0) {
            product.depotDistribution.splice(ddIdx, 1);
          }
          await product.save();
          newStock = product.stock;

          const dpIdx = fromDepot.products.findIndex(p => p.productId.toString() === product._id.toString());
          if (dpIdx >= 0) {
            fromDepot.products[dpIdx].quantity -= qty;
            if (fromDepot.products[dpIdx].quantity === 0) fromDepot.products.splice(dpIdx, 1);
          }
          fromDepot.currentUtilization -= qty;
          fromDepot.itemsStored = fromDepot.products.length;
          await fromDepot.save();

        } else if (type === 'transfer') {
          if (!fromDepot || !toDepot) {
            results.errors.push(`Row ${rowNum}: Both fromDepot and toDepot required for transfer`);
            results.failed++;
            continue;
          }
          // deduct from source
          const srcIdx = product.depotDistribution.findIndex(
            d => d.depotId.toString() === fromDepot._id.toString()
          );
          if (srcIdx < 0 || product.depotDistribution[srcIdx].quantity < qty) {
            results.errors.push(`Row ${rowNum}: Insufficient stock in source depot "${fromDepotN}"`);
            results.failed++;
            continue;
          }
          product.depotDistribution[srcIdx].quantity -= qty;
          if (product.depotDistribution[srcIdx].quantity === 0) product.depotDistribution.splice(srcIdx, 1);
          // add to dest
          const dstIdx = product.depotDistribution.findIndex(
            d => d.depotId.toString() === toDepot._id.toString()
          );
          if (dstIdx >= 0) {
            product.depotDistribution[dstIdx].quantity += qty;
          } else {
            product.depotDistribution.push({ depotId: toDepot._id, depotName: toDepot.name, quantity: qty, lastUpdated: new Date() });
          }
          await product.save();
          newStock = product.stock;
        }
        // adjustment: no stock change, just record
        else if (type === 'adjustment') {
          newStock = previousStock;
        }

        txDoc.newStock = newStock;
        txsToInsert.push(txDoc);
        results.success++;

        // Trigger alert check
        await createStockAlert(product, req.organizationId).catch(() => {});

      } catch (rowErr) {
        results.errors.push(`Row ${rowNum}: ${rowErr.message}`);
        results.failed++;
      }
    }

    if (txsToInsert.length > 0) {
      await Transaction.insertMany(txsToInsert);
    }

    res.status(200).json({
      message: `CSV import complete. ${results.success} succeeded, ${results.failed} failed.`,
      ...results
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

