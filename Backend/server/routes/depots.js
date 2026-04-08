const express = require('express');
const router = express.Router();
const Depot = require('../models/Depot');
const Product = require('../models/Product');
const Alert = require('../models/Alert');
const { requirePermission } = require('../middleware/permissions');
const { depotAccess } = require('../middleware/depotAccess');

// GET all depots (all org members can view all depots — read-only for staff)
router.get('/', async (req, res, next) => {
  try {
    const depots = await Depot.find({ userId: req.organizationId }).sort({ createdAt: -1 });

    res.json({
      depots: depots.map(depot => ({
        id: depot._id,
        name: depot.name,
        location: depot.location,
        capacity: depot.capacity,
        currentUtilization: depot.currentUtilization,
        itemsStored: depot.itemsStored,
        status: depot.status,
        products: depot.products,
        lat: depot.lat,
        lng: depot.lng,
        createdAt: depot.createdAt
      })),
      total: depots.length
    });
  } catch (error) {
    next(error);
  }
});

// POST - Create depot (MANAGER + ADMIN)
router.post('/', requirePermission('depots:manage'), async (req, res, next) => {
  try {
    const { name, location, capacity, lat, lng } = req.body;

    const depot = new Depot({
      userId: req.organizationId,
      name,
      location,
      capacity,
      lat: lat || null,
      lng: lng || null,
      currentUtilization: 0,
      itemsStored: 0,
      products: [],
      status: 'normal'
    });

    await depot.save();

    res.status(201).json({
      message: 'Depot created successfully',
      depot
    });
  } catch (error) {
    next(error);
  }
});

// PATCH - Update depot map coordinates (drag & drop pin)
router.patch('/:id/coordinates', requirePermission('depots:manage'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { lat, lng } = req.body;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ message: 'lat and lng are required' });
    }

    const depot = await Depot.findOneAndUpdate(
      { _id: id, userId: req.organizationId },
      { lat, lng, updatedAt: new Date() },
      { new: true }
    );

    if (!depot) {
      return res.status(404).json({ message: 'Depot not found' });
    }

    res.json({ message: 'Coordinates updated', lat: depot.lat, lng: depot.lng });
  } catch (error) {
    next(error);
  }
});

// GET depot details with products and transactions
router.get('/:depotId/details', async (req, res, next) => {
  try {
    const { depotId } = req.params;
    const Transaction = require('../models/Transaction');

    const depot = await Depot.findOne({ _id: depotId, userId: req.organizationId });
    if (!depot) {
      return res.status(404).json({ message: 'Depot not found' });
    }

    // Get products that have this depot in their depotDistribution (source of truth)
    const products = await Product.find({
      userId: req.organizationId,
      'depotDistribution.depotId': depotId
    });

    // Format products with depot-specific quantity
    const inventoryItems = products.map(product => {
      const depotDist = product.depotDistribution.find(
        d => d.depotId.toString() === depotId
      );
      return {
        sku: product.sku,
        productName: product.name,
        category: product.category,
        quantity: depotDist ? depotDist.quantity : 0,
        lastUpdated: depotDist ? depotDist.lastUpdated : product.updatedAt,
        price: product.price,
        status: product.status,
        image: product.image
      };
    });

    // Get recent transactions for this depot (last 10)
    const recentTransactions = await Transaction.find({
      userId: req.organizationId,
      $or: [
        { toDepotId: depotId },
        { fromDepotId: depotId }
      ]
    })
    .sort({ timestamp: -1 })
    .limit(10)
    .select('productName productSku transactionType quantity timestamp toDepot fromDepot');

    res.json({
      depot: {
        id: depot._id,
        name: depot.name,
        location: depot.location,
        capacity: depot.capacity,
        currentUtilization: depot.currentUtilization,
        itemsStored: depot.itemsStored || depot.products.length,
        status: depot.status,
        inventory: inventoryItems,
        recentTransactions: recentTransactions.map(tx => ({
          id: tx._id,
          productName: tx.productName,
          productSku: tx.productSku,
          type: tx.transactionType,
          quantity: tx.quantity,
          timestamp: tx.timestamp,
          toDepot: tx.toDepot,
          fromDepot: tx.fromDepot
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

// DELETE depot entirely (MANAGER + ADMIN)
router.delete('/:id', requirePermission('depots:manage'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const depot = await Depot.findOne({ _id: id, userId: req.organizationId });
    if (!depot) {
      return res.status(404).json({ message: 'Depot not found' });
    }

    if (depot.currentUtilization > 0 || depot.itemsStored > 0) {
      return res.status(400).json({
        message: 'Cannot delete depot because it still contains stock. Please transfer or adjust out all inventory before deleting.'
      });
    }

    // Find all products that have this depot in their distribution
    const affectedProducts = await Product.find({
      userId: req.organizationId,
      'depotDistribution.depotId': id
    });

    // Remove depot from each product's distribution array
    for (const product of affectedProducts) {
      product.depotDistribution = product.depotDistribution.filter(
        d => d.depotId.toString() !== id
      );
      await product.save(); // Triggers pre-save hook to recalculate stock
    }

    // Remove all depot assignments for this depot
    const DepotAssignment = require('../models/DepotAssignment');
    await DepotAssignment.deleteMany({ depotId: id });

    // Delete the depot
    await Depot.deleteOne({ _id: id });

    // Emit WebSocket events to notify all open clients to refresh
    const io = req.app.get('io');
    if (io) {
      io.emit('depot:deleted', { depotId: id, depotName: depot.name });
      io.emit('inventory:refresh', { reason: 'depot-deleted', depotId: id });
      io.emit('dashboard:refresh', { reason: 'depot-deleted' });
    }

    res.json({
      message: 'Depot deleted successfully',
      affectedProducts: affectedProducts.length
    });
  } catch (error) {
    next(error);
  }
});

// DELETE all products from depot — Bulk Clear (MANAGER + ADMIN)
router.delete('/:id/products', requirePermission('depots:manage'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const Transaction = require('../models/Transaction');

    const depot = await Depot.findOne({ _id: id, userId: req.organizationId });
    if (!depot) {
      return res.status(404).json({ message: 'Depot not found' });
    }

    // Find all products that have this depot in their distribution (Product is source of truth)
    const affectedProducts = await Product.find({
      userId: req.organizationId,
      'depotDistribution.depotId': id
    });

    const transactionsToInsert = [];
    let autoDeletedCount = 0;

    for (const product of affectedProducts) {
      const distIndex = product.depotDistribution.findIndex(d => d.depotId.toString() === id);
      if (distIndex >= 0) {
        const qtyToRemove = product.depotDistribution[distIndex].quantity;
        const previousStock = product.stock;

        // Remove this depot entry from the product's distribution
        product.depotDistribution.splice(distIndex, 1);
        product.updatedAt = new Date();
        // pre-save hook recalculates product.stock = sum(remaining depotDistribution)
        await product.save();

        // Always record the adjustment transaction for audit purposes
        transactionsToInsert.push({
          userId: req.organizationId,
          productId: product._id,
          productName: product.name,
          productSku: product.sku,
          transactionType: 'adjustment',
          quantity: qtyToRemove,
          fromDepot: depot.name,
          fromDepotId: depot._id,
          previousStock,
          newStock: product.stock,
          reason: 'Cleared via Depot wipe',
          notes: 'Bulk stock clearance initiated from Depot details.',
          performedBy: req.userRole === 'admin' ? 'Admin' : 'Manager'
        });

        // AUTO-DELETE: if total stock across ALL depots is now 0, remove the product
        if (product.stock === 0 && product.depotDistribution.length === 0) {
          await Alert.deleteMany({ productId: product._id });
          await Product.findByIdAndDelete(product._id);
          autoDeletedCount++;
        }
      }
    }

    if (transactionsToInsert.length > 0) {
      await Transaction.insertMany(transactionsToInsert);
    }

    // Clear depot's embedded product cache — Depot pre-save hook will
    // recalculate currentUtilization (0) and itemsStored (0) from empty array
    depot.products = [];
    await depot.save();

    // Emit WebSocket events to notify all open clients to refresh
    const io = req.app.get('io');
    if (io) {
      io.emit('depot:inventory-cleared', {
        depotId: depot._id,
        depotName: depot.name,
        clearedItems: affectedProducts.length,
        autoDeletedProducts: autoDeletedCount
      });
      io.emit('inventory:refresh', { reason: 'depot-bulk-clear', depotId: depot._id });
      io.emit('dashboard:refresh', { reason: 'depot-bulk-clear' });
    }

    res.json({
      message: `All inventory successfully cleared from the depot${autoDeletedCount > 0 ? `. ${autoDeletedCount} zero-stock product(s) permanently deleted.` : ''}`,
      clearedItems: affectedProducts.length,
      autoDeletedProducts: autoDeletedCount
    });
  } catch (error) {
    next(error);
  }
});

// DELETE single product from depot (MANAGER + ADMIN)
router.delete('/:id/products/:sku', requirePermission('depots:manage'), async (req, res, next) => {
  try {
    const { id, sku } = req.params;
    const Transaction = require('../models/Transaction');

    const depot = await Depot.findOne({ _id: id, userId: req.organizationId });
    if (!depot) {
      return res.status(404).json({ message: 'Depot not found' });
    }

    const product = await Product.findOne({ userId: req.organizationId, sku });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const distIndex = product.depotDistribution.findIndex(d => d.depotId.toString() === id);
    if (distIndex < 0) {
      return res.status(400).json({ message: 'Product is not in this depot' });
    }

    const qtyToRemove = product.depotDistribution[distIndex].quantity;
    const previousStock = product.stock;
    const productName = product.name; // capture before possible deletion

    // --- Step 1: Update Product (source of truth) ---
    product.depotDistribution.splice(distIndex, 1);
    product.updatedAt = new Date();
    // pre-save hook recalculates product.stock and product.status
    await product.save();

    // --- Step 2: Update Depot embedded cache ---
    depot.products = depot.products.filter(
      p => !(p.productSku === sku || p.productId?.toString() === product._id.toString())
    );
    await depot.save();

    // --- Step 3: Log the adjustment transaction (before possible deletion) ---
    const transaction = new Transaction({
      userId: req.organizationId,
      productId: product._id,
      productName: productName,
      productSku: product.sku,
      transactionType: 'adjustment',
      quantity: qtyToRemove,
      fromDepot: depot.name,
      fromDepotId: depot._id,
      previousStock,
      newStock: product.stock,
      reason: 'Cleared via Depot wipe',
      notes: 'Single product removal initiated from Depot details.',
      performedBy: req.userRole === 'admin' ? 'Admin' : 'Manager'
    });
    await transaction.save();

    // --- Step 4: AUTO-DELETE if total stock across all depots is now 0 ---
    let productAutoDeleted = false;
    if (product.stock === 0 && product.depotDistribution.length === 0) {
      await Alert.deleteMany({ productId: product._id });
      await Product.findByIdAndDelete(product._id);
      productAutoDeleted = true;
    }

    // Emit WebSocket events to notify all open clients to refresh
    const io = req.app.get('io');
    if (io) {
      io.emit('depot:product-removed', {
        depotId: depot._id,
        depotName: depot.name,
        productSku: sku,
        productName,
        newStock: product.stock,
        productAutoDeleted
      });
      io.emit('inventory:refresh', { reason: 'depot-product-remove', depotId: depot._id, productSku: sku });
      io.emit('dashboard:refresh', { reason: 'depot-product-remove' });
    }

    res.json({
      message: productAutoDeleted
        ? `Product "${productName}" removed from depot and permanently deleted (zero stock across all depots).`
        : 'Product successfully cleared from this depot',
      productSku: sku,
      clearedQuantity: qtyToRemove,
      newProductStock: productAutoDeleted ? 0 : product.stock,
      productStatus: productAutoDeleted ? 'deleted' : product.status,
      productAutoDeleted
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
