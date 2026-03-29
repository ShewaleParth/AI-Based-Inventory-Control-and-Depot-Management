const express = require('express');
const router = express.Router();
const Depot = require('../models/Depot');
const Product = require('../models/Product');
const { requirePermission } = require('../middleware/permissions');
const { depotAccess } = require('../middleware/depotAccess');

// GET all depots (all org members can view all depots — read-only for staff)
router.get('/', async (req, res, next) => {
  try {
    // Use organizationId so employees see all org depots
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

    // Get products that have this depot in their depotDistribution
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

// DELETE depot (MANAGER + ADMIN)
router.delete('/:id', requirePermission('depots:manage'), async (req, res, next) => {
  try {
    const { id } = req.params;

    // Find and verify depot belongs to this organization
    const depot = await Depot.findOne({ _id: id, userId: req.organizationId });
    if (!depot) {
      return res.status(404).json({ message: 'Depot not found' });
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

    res.json({
      message: 'Depot deleted successfully',
      affectedProducts: affectedProducts.length
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
