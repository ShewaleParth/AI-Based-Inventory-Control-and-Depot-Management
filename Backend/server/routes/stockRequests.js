const express = require('express');
const router = express.Router();
const StockRequest = require('../models/StockRequest');
const Product = require('../models/Product');
const Depot = require('../models/Depot');
const DepotAssignment = require('../models/DepotAssignment');

/**
 * @route   GET /api/stock-requests
 * @desc    List stock requests (own requests for staff, all for admin)
 * @access  Private
 */
router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = { organizationId: req.organizationId };

    // Staff only see their own requests
    if (req.userRole === 'staff') {
      query.requestedBy = req.userId;
    }

    if (status) query.status = status;

    const requests = await StockRequest.find(query)
      .populate('requestedBy', 'first_name last_name email')
      .sort({ createdAt: -1 });

    res.json({
      requests: requests.map(r => ({
        id: r._id,
        requestedBy: {
          id: r.requestedBy?._id,
          name: r.requestedBy ? `${r.requestedBy.first_name} ${r.requestedBy.last_name}` : 'Unknown'
        },
        product: { id: r.productId, name: r.productName, sku: r.productSku },
        quantity: r.quantity,
        fromDepot: { id: r.fromDepotId, name: r.fromDepotName },
        toDepot: { id: r.toDepotId, name: r.toDepotName },
        reason: r.reason,
        status: r.status,
        reviewNotes: r.reviewNotes,
        createdAt: r.createdAt,
        reviewedAt: r.reviewedAt
      })),
      total: requests.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/stock-requests
 * @desc    Create a new stock request (employee requests stock from another depot)
 * @access  Private (staff/manager)
 */
router.post('/', async (req, res, next) => {
  try {
    const { productId, quantity, fromDepotId, toDepotId, reason } = req.body;

    if (!productId || !quantity || !fromDepotId || !toDepotId) {
      return res.status(400).json({
        message: 'Product ID, quantity, source depot, and destination depot are required'
      });
    }

    if (fromDepotId === toDepotId) {
      return res.status(400).json({ message: 'Source and destination depot must be different' });
    }

    if (quantity <= 0) {
      return res.status(400).json({ message: 'Quantity must be greater than 0' });
    }

    // Verify employee has assignment for the destination depot
    if (req.userRole !== 'admin') {
      const assignment = await DepotAssignment.findOne({
        userId: req.userId,
        depotId: toDepotId,
        organizationId: req.organizationId
      });

      if (!assignment) {
        return res.status(403).json({
          message: 'You can only request stock to a depot you are assigned to'
        });
      }
    }

    // Verify product and depots exist in the org
    const product = await Product.findOne({ _id: productId, userId: req.organizationId });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const fromDepot = await Depot.findOne({ _id: fromDepotId, userId: req.organizationId });
    const toDepot = await Depot.findOne({ _id: toDepotId, userId: req.organizationId });

    if (!fromDepot || !toDepot) {
      return res.status(404).json({ message: 'One or both depots not found' });
    }

    // Check if product has enough stock in source depot
    const sourceDist = product.depotDistribution.find(
      d => d.depotId.toString() === fromDepotId
    );

    if (!sourceDist || sourceDist.quantity < quantity) {
      return res.status(400).json({
        message: 'Insufficient stock in source depot',
        availableStock: sourceDist ? sourceDist.quantity : 0
      });
    }

    const stockRequest = new StockRequest({
      requestedBy: req.userId,
      organizationId: req.organizationId,
      productId: product._id,
      productName: product.name,
      productSku: product.sku,
      quantity,
      fromDepotId: fromDepot._id,
      fromDepotName: fromDepot.name,
      toDepotId: toDepot._id,
      toDepotName: toDepot.name,
      reason: reason || '',
      status: 'pending'
    });

    await stockRequest.save();

    res.status(201).json({
      message: 'Stock request created successfully. Waiting for admin approval.',
      request: {
        id: stockRequest._id,
        productName: stockRequest.productName,
        quantity: stockRequest.quantity,
        fromDepot: stockRequest.fromDepotName,
        toDepot: stockRequest.toDepotName,
        status: stockRequest.status
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
