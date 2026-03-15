// NOTE: This is a placeholder for product routes
// The full implementation should be extracted from server.js lines 662-1300+
// Due to the large size, this shows the structure

const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Depot = require('../models/Depot');
const Transaction = require('../models/Transaction');
const { generateUniqueSKU, updateProductStatus, updateProductStockFromDepots } = require('../utils/productHelpers');
const { createStockAlert, checkDepotCapacity } = require('../utils/alertHelpers');
const { recalculateDepotMetrics } = require('../utils/depotHelpers');
const { requirePermission } = require('../middleware/permissions');
const { paginate } = require('../utils/queryBuilder');

// GET all products
router.get('/', async (req, res, next) => {
  try {
    const { search, category, status, location, ...restQuery } = req.query;

    const query = { userId: req.organizationId, ...restQuery };

    if (location) {
      query.location = location;
    }

    if (search) {
      query.search = search;
    }

    if (category && category !== 'all') {
      query.category = category;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    const result = await paginate(Product, query);

    res.json({
      products: result.data.map(product => {
        const dailySales = Number(product.dailySales || 5);
        const weeklySales = Number(product.weeklySales || 35);
        const leadTime = Number(product.leadTime || 7);
        const stock = Number(product.stock || 0);

        // Backend Intelligence Logic
        const avgDailyDemand = (dailySales * 0.7) + ((weeklySales / 7) * 0.3);
        const daysToStockOut = (avgDailyDemand > 0) ? Math.max(0, Math.round(stock / avgDailyDemand)) : 99;
        const safetyStock = Math.round(avgDailyDemand * leadTime * 0.5);
        const reorderQty = Math.round(avgDailyDemand * 30);

        let riskLevel = 'SAFE';
        let aiExplanation = 'Inventory levels healthy.';

        if (stock === 0 || daysToStockOut <= leadTime) {
          riskLevel = 'HIGH';
          aiExplanation = stock === 0 ? 'Item is out of stock. Immediate reorder required.' : 'Stock expected to exhaust before supplier lead time.';
        } else if (daysToStockOut <= leadTime * 2) {
          riskLevel = 'MEDIUM';
          aiExplanation = 'Monitor closely. Demand trend increasing.';
        }

        return {
          id: product._id,
          sku: product.sku,
          name: product.name,
          category: product.category,
          stock: product.stock,
          reorderPoint: product.reorderPoint,
          calculatedReorderPoint: Math.round((avgDailyDemand * leadTime) + safetyStock),
          supplier: product.supplier,
          price: product.price,
          status: product.status,
          image: product.image,
          dailySales: product.dailySales,
          weeklySales: product.weeklySales,
          brand: product.brand,
          leadTime: product.leadTime,
          avgDailyDemand: avgDailyDemand.toFixed(1),
          daysToStockOut,
          reorderQty,
          riskLevel,
          aiExplanation,
          depotDistribution: product.depotDistribution,
          lastSoldDate: product.lastSoldDate ? new Date(product.lastSoldDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
        };
      }),
      total: result.pagination.total,
      pages: result.pagination.pages,
      currentPage: result.pagination.page,
      limit: result.pagination.limit,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

// POST - Create product (STAFF, MANAGER, ADMIN)
router.post('/', requirePermission('products:write'), async (req, res, next) => {
  try {
    const userId = req.organizationId;
    let { sku, name, category, stock, reorderPoint, supplier, price, depotId, depotQuantity, image } = req.body;

    if (!depotId) {
      return res.status(400).json({ message: 'Depot assignment is required for all products' });
    }

    if (!sku) {
      sku = await generateUniqueSKU(category);
    }

    const depot = await Depot.findOne({ _id: depotId, userId });
    if (!depot) {
      return res.status(404).json({ message: 'Depot not found' });
    }

    const assignedQuantity = depotQuantity || stock;

    let product = new Product({
      userId,
      sku,
      name,
      category,
      stock: assignedQuantity,
      reorderPoint,
      supplier,
      price,
      depotDistribution: [{
        depotId: depot._id,
        depotName: depot.name,
        quantity: assignedQuantity,
        lastUpdated: new Date()
      }],
      image: image
    });

    await product.save();

    // Update depot's products array
    depot.products.push({
      productId: product._id,
      productName: product.name,
      productSku: product.sku,
      quantity: assignedQuantity,
      lastUpdated: new Date()
    });
    await depot.save();

    // Check depot capacity for alerts
    await checkDepotCapacity(depot._id, userId);

    // Create transaction record
    const transaction = new Transaction({
      userId,
      productId: product._id,
      productName: product.name,
      productSku: product.sku,
      transactionType: 'stock-in',
      quantity: assignedQuantity,
      toDepot: depot.name,
      toDepotId: depot._id,
      previousStock: 0,
      newStock: assignedQuantity,
      reason: 'Initial stock',
      performedBy: 'System'
    });
    await transaction.save();

    await createStockAlert(product, userId);

    res.status(201).json({
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    next(error);
  }
});

// POST - Bulk upload products (CSV import)
router.post('/bulk', async (req, res, next) => {
  try {
    const productsData = req.body;
    const userId = req.organizationId;
    const io = req.app.get('io'); // Get WebSocket instance

    console.log('Bulk upload request received:', {
      itemCount: Array.isArray(productsData) ? productsData.length : 'not an array',
      firstItem: Array.isArray(productsData) && productsData.length > 0 ? productsData[0] : null
    });

    if (!Array.isArray(productsData)) {
      return res.status(400).json({
        message: 'Input must be an array of products',
        received: typeof productsData
      });
    }

    if (productsData.length === 0) {
      return res.status(400).json({ message: 'No products provided' });
    }

    // Fetch all user's depots
    let userDepots = await Depot.find({ userId });
    console.log(` Found ${userDepots.length} existing depots`);

    const results = {
      success: 0,
      failed: 0,
      depotsCreated: 0,
      transactionsCreated: 0,
      errors: []
    };

    for (const item of productsData) {
      try {
        // Field mapping - handle both camelCase and lowercase
        const sku = item.sku || item.SKU;
        const name = item.name || item.Name || item.productname;
        const category = item.category || item.Category;
        const stock = item.stock || item.Stock || item.quantity;
        const price = item.price || item.Price;
        const supplier = item.supplier || item.Supplier;
        const reorderPoint = item.reorderpoint || item.reorderPoint || item.ReorderPoint;
        const dailySales = item.dailysales || item.dailySales || item.DailySales;
        const weeklySales = item.weeklysales || item.weeklySales || item.WeeklySales;
        const brand = item.brand || item.Brand;
        const leadTime = item.leadtime || item.leadTime || item.LeadTime;
        const riskLevel = item.risklevel || item.riskLevel || item.RiskLevel || item.risk;
        const image = item.image || item.Image;
        const stockoutIn = item.stockoutin || item.stockoutIn || item.StockoutIn;
        const reorderQty = item.reorderqty || item.reorderQty || item.ReorderQty;

        // Depot assignment from CSV
        const depotName = item.depot || item.Depot || item.depotName || item.DepotName;
        const depotLocation = item.depotLocation || item.DepotLocation || item.location || item.Location;
        const depotCapacity = item.depotCapacity || item.DepotCapacity || 10000;

        // Basic validation
        if (!sku || !name) {
          throw new Error(`Missing required fields: ${!sku ? 'sku' : ''} ${!name ? 'name' : ''}`.trim());
        }

        // AUTO-CREATE DEPOT if specified in CSV and doesn't exist
        let targetDepot = null;

        if (depotName) {
          // Try to find existing depot
          targetDepot = userDepots.find(d =>
            d.name.toLowerCase() === depotName.toLowerCase() ||
            d.name.toLowerCase().includes(depotName.toLowerCase())
          );

          // If not found, CREATE IT
          if (!targetDepot) {
            console.log(` Creating new depot: ${depotName}`);
            targetDepot = new Depot({
              userId,
              name: depotName,
              location: depotLocation || 'Unknown',
              capacity: Number(depotCapacity),
              currentUtilization: 0,
              itemsStored: 0,
              products: [],
              status: 'normal'
            });
            await targetDepot.save();
            userDepots.push(targetDepot); // Add to cache
            results.depotsCreated++;

            // Emit WebSocket event for depot creation
            if (io) {
              io.emit('depot:created', {
                depotId: targetDepot._id,
                depotName: targetDepot.name,
                location: targetDepot.location
              });
            }
            console.log(` Created depot: ${depotName} at ${depotLocation}`);
          }
        }

        // Fallback: if no depot specified or found, use first available or create default
        if (!targetDepot) {
          if (userDepots.length > 0) {
            targetDepot = userDepots[Math.floor(Math.random() * userDepots.length)];
          } else {
            // Create a default depot
            console.log(` Creating default depot`);
            targetDepot = new Depot({
              userId,
              name: 'Main Warehouse',
              location: 'Default Location',
              capacity: 10000,
              currentUtilization: 0,
              itemsStored: 0,
              products: [],
              status: 'normal'
            });
            await targetDepot.save();
            userDepots.push(targetDepot);
            results.depotsCreated++;

            if (io) {
              io.emit('depot:created', {
                depotId: targetDepot._id,
                depotName: targetDepot.name,
                location: targetDepot.location
              });
            }
          }
        }

        // Check if product exists
        let product = await Product.findOne({ sku, userId });

        if (product) {
          // UPDATE EXISTING PRODUCT
          if (name) product.name = name;
          if (category) product.category = category;
          if (reorderPoint !== undefined) product.reorderPoint = Number(reorderPoint);
          if (supplier) product.supplier = supplier;
          if (price !== undefined) product.price = Number(price);
          if (dailySales !== undefined) product.dailySales = Number(dailySales);
          if (weeklySales !== undefined) product.weeklySales = Number(weeklySales);
          if (brand) product.brand = brand;
          if (leadTime !== undefined) product.leadTime = Number(leadTime);
          if (riskLevel) product.riskLevel = riskLevel;
          if (image) product.image = image;
          if (stockoutIn !== undefined) product.stockoutIn = Number(stockoutIn);
          if (reorderQty !== undefined) product.reorderQty = Number(reorderQty);

          // Add stock to depot
          const stockToAdd = Number(stock) || 0;
          if (stockToAdd > 0) {
            const previousStock = product.stock || 0;

            // Update product depot distribution
            const existingDepotIndex = product.depotDistribution.findIndex(
              d => d.depotId.toString() === targetDepot._id.toString()
            );

            if (existingDepotIndex >= 0) {
              product.depotDistribution[existingDepotIndex].quantity += stockToAdd;
              product.depotDistribution[existingDepotIndex].lastUpdated = new Date();
            } else {
              product.depotDistribution.push({
                depotId: targetDepot._id,
                depotName: targetDepot.name,
                quantity: stockToAdd,
                lastUpdated: new Date()
              });
            }

            // Update depot's products array
            const depotProductIndex = targetDepot.products.findIndex(
              p => p.productId.toString() === product._id.toString()
            );

            if (depotProductIndex >= 0) {
              targetDepot.products[depotProductIndex].quantity += stockToAdd;
              targetDepot.products[depotProductIndex].lastUpdated = new Date();
            } else {
              targetDepot.products.push({
                productId: product._id,
                productName: product.name,
                productSku: product.sku,
                quantity: stockToAdd,
                lastUpdated: new Date()
              });
            }

            await targetDepot.save();
            await checkDepotCapacity(targetDepot._id, userId);

            // CREATE TRANSACTION RECORD
            const newStock = previousStock + stockToAdd;
            const transaction = new Transaction({
              userId,
              productId: product._id,
              productName: product.name,
              productSku: product.sku,
              transactionType: 'stock-in',
              quantity: stockToAdd,
              toDepot: targetDepot.name,
              toDepotId: targetDepot._id,
              previousStock: previousStock,
              newStock: newStock,
              reason: 'CSV Bulk Upload',
              performedBy: 'System',
              timestamp: new Date(),
              createdAt: new Date()
            });
            await transaction.save();
            results.transactionsCreated++;

            // EMIT WEBSOCKET EVENT
            if (io) {
              io.emit('transaction:created', {
                productId: product._id,
                productName: product.name,
                productSku: product.sku,
                transactionType: 'stock-in',
                quantity: stockToAdd,
                depotName: targetDepot.name,
                depotId: targetDepot._id
              });

              io.emit('depot:stock-updated', {
                depotId: targetDepot._id,
                depotName: targetDepot.name,
                currentUtilization: targetDepot.currentUtilization,
                itemsStored: targetDepot.itemsStored
              });
            }

            const assignmentMethod = depotName ? '(CSV specified)' : '(random)';
            console.log(` Added ${stockToAdd} units of ${sku} to depot: ${targetDepot.name} ${assignmentMethod}`);
          }

          product.updatedAt = new Date();
        } else {
          // CREATE NEW PRODUCT
          const stockQty = Number(stock) || 0;

          product = new Product({
            userId,
            sku,
            name,
            category: category || 'Uncategorized',
            stock: stockQty,
            reorderPoint: Number(reorderPoint) || 10,
            supplier: supplier || 'Unknown',
            price: Number(price) || 0,
            dailySales: Number(dailySales) || 5,
            weeklySales: Number(weeklySales) || 35,
            brand: brand || 'Generic',
            leadTime: Number(leadTime) || 7,
            riskLevel: riskLevel || 'SAFE',
            stockoutIn: Number(stockoutIn) || 0,
            reorderQty: Number(reorderQty) || 0,
            image: image || '',
            depotDistribution: stockQty > 0 ? [{
              depotId: targetDepot._id,
              depotName: targetDepot.name,
              quantity: stockQty,
              lastUpdated: new Date()
            }] : []
          });

          // Add product to depot
          if (stockQty > 0) {
            targetDepot.products.push({
              productId: product._id,
              productName: product.name,
              productSku: product.sku,
              quantity: stockQty,
              lastUpdated: new Date()
            });

            await targetDepot.save();
            await checkDepotCapacity(targetDepot._id, userId);

            // CREATE TRANSACTION RECORD
            const transaction = new Transaction({
              userId,
              productId: product._id,
              productName: product.name,
              productSku: product.sku,
              transactionType: 'stock-in',
              quantity: stockQty,
              toDepot: targetDepot.name,
              toDepotId: targetDepot._id,
              previousStock: 0,
              newStock: stockQty,
              reason: 'CSV Bulk Upload - New Product',
              performedBy: 'System',
              timestamp: new Date(),
              createdAt: new Date()
            });
            await transaction.save();
            results.transactionsCreated++;

            // EMIT WEBSOCKET EVENTS
            if (io) {
              io.emit('product:depot-assigned', {
                productId: product._id,
                productName: product.name,
                depotId: targetDepot._id,
                depotName: targetDepot.name,
                quantity: stockQty
              });

              io.emit('transaction:created', {
                productId: product._id,
                productName: product.name,
                productSku: product.sku,
                transactionType: 'stock-in',
                quantity: stockQty,
                depotName: targetDepot.name,
                depotId: targetDepot._id
              });

              io.emit('depot:stock-updated', {
                depotId: targetDepot._id,
                depotName: targetDepot.name,
                currentUtilization: targetDepot.currentUtilization,
                itemsStored: targetDepot.itemsStored
              });
            }

            const assignmentMethod = depotName ? '(CSV specified)' : '(random)';
            console.log(` Created product ${sku} and assigned to depot: ${targetDepot.name} ${assignmentMethod}`);
          }
        }

        await product.save();
        await createStockAlert(product, userId);
        results.success++;
      } catch (err) {
        console.error(`Error processing item ${item.sku}:`, err.message);
        results.failed++;
        results.errors.push({
          sku: item.sku || 'unknown',
          error: err.message,
          item: item
        });
      }
    }

    console.log('Bulk upload results:', results);

    res.json({
      message: `Processed ${productsData.length} items`,
      results
    });

  } catch (error) {
    console.error('Bulk upload error:', error);
    next(error);
  }
});

// POST - Enhanced bulk upload with transactions (CSV import with transaction history)
router.post('/bulk-with-transactions', async (req, res, next) => {
  try {
    const productsData = req.body;
    const userId = req.organizationId;

    if (!Array.isArray(productsData)) {
      return res.status(400).json({ message: 'Input must be an array of products' });
    }

    const results = {
      success: 0,
      failed: 0,
      productsCreated: 0,
      productsUpdated: 0,
      depotsCreated: 0,
      transactionsCreated: 0,
      errors: []
    };

    // Group transactions by SKU
    const productGroups = {};
    productsData.forEach(item => {
      if (!productGroups[item.sku]) {
        productGroups[item.sku] = [];
      }
      productGroups[item.sku].push(item);
    });

    // Process each product group
    for (const [sku, transactions] of Object.entries(productGroups)) {
      try {
        // Sort transactions by date to process chronologically
        transactions.sort((a, b) => new Date(a.transactionDate) - new Date(b.transactionDate));

        const firstTransaction = transactions[0];

        // Validate required fields
        if (!firstTransaction.sku || !firstTransaction.name) {
          throw new Error(`Missing SKU or Name for product: ${sku}`);
        }

        // Find or create depot
        let depot = null;
        if (firstTransaction.depotName) {
          depot = await Depot.findOne({ name: firstTransaction.depotName, userId });

          if (!depot) {
            // Auto-create depot
            depot = new Depot({
              userId,
              name: firstTransaction.depotName,
              location: firstTransaction.depotLocation || 'Unknown',
              capacity: Number(firstTransaction.depotCapacity) || 10000,
              currentUtilization: 0,
              itemsStored: 0,
              products: [],
              status: 'normal'
            });
            await depot.save();
            results.depotsCreated++;
            console.log(` Created depot: ${depot.name}`);
          }
        }

        // Check if product exists
        let product = await Product.findOne({ sku, userId });
        let isNewProduct = false;

        if (!product) {
          // Create new product
          product = new Product({
            userId,
            sku: firstTransaction.sku,
            name: firstTransaction.name,
            category: firstTransaction.category || 'Uncategorized',
            stock: 0, // Will be calculated from transactions
            reorderPoint: Number(firstTransaction.reorderPoint) || 10,
            supplier: firstTransaction.supplier || 'Unknown',
            price: Number(firstTransaction.price) || 0,
            depotDistribution: []
          });
          isNewProduct = true;
          results.productsCreated++;
        } else {
          results.productsUpdated++;
        }

        // Process all transactions for this product
        let currentStock = product.stock;
        let depotStock = 0;

        for (const txn of transactions) {
          const quantity = Number(txn.transactionQuantity) || 0;
          const previousStock = currentStock;

          // Calculate new stock based on transaction type
          if (txn.transactionType === 'stock-in') {
            currentStock += quantity;
            depotStock += quantity;
          } else if (txn.transactionType === 'stock-out') {
            currentStock -= quantity;
            depotStock -= quantity;
          }

          // Create transaction record
          const transaction = new Transaction({
            userId,
            productId: product._id,
            productName: product.name,
            productSku: product.sku,
            transactionType: txn.transactionType,
            quantity: quantity,
            toDepot: txn.transactionType === 'stock-in' && depot ? depot.name : undefined,
            toDepotId: txn.transactionType === 'stock-in' && depot ? depot._id : undefined,
            fromDepot: txn.transactionType === 'stock-out' && depot ? depot.name : undefined,
            fromDepotId: txn.transactionType === 'stock-out' && depot ? depot._id : undefined,
            previousStock: previousStock,
            newStock: currentStock,
            reason: txn.transactionReason || 'CSV Import',
            performedBy: 'System',
            timestamp: new Date(txn.transactionDate),
            createdAt: new Date(txn.transactionDate)
          });
          await transaction.save();
          results.transactionsCreated++;
        }

        // Update product with final stock
        product.stock = Math.max(0, currentStock);

        // Update depot distribution
        if (depot && depotStock > 0) {
          const depotDistIndex = product.depotDistribution.findIndex(
            d => d.depotId.toString() === depot._id.toString()
          );

          if (depotDistIndex >= 0) {
            product.depotDistribution[depotDistIndex].quantity = depotStock;
            product.depotDistribution[depotDistIndex].lastUpdated = new Date();
          } else {
            product.depotDistribution.push({
              depotId: depot._id,
              depotName: depot.name,
              quantity: depotStock,
              lastUpdated: new Date()
            });
          }
        }

        product.updatedAt = new Date();
        await product.save();

        // Update depot with product
        if (depot && depotStock > 0) {
          const existingProductIndex = depot.products.findIndex(
            p => p.productId.toString() === product._id.toString()
          );

          if (existingProductIndex >= 0) {
            depot.products[existingProductIndex].quantity = depotStock;
            depot.products[existingProductIndex].lastUpdated = new Date();
          } else {
            depot.products.push({
              productId: product._id,
              productName: product.name,
              productSku: product.sku,
              quantity: depotStock,
              lastUpdated: new Date()
            });
          }

          depot.itemsStored = depot.products.length;
          depot.currentUtilization = depot.products.reduce((sum, p) => sum + p.quantity, 0);

          // Update depot status based on utilization
          const utilizationPercentage = (depot.currentUtilization / depot.capacity) * 100;
          if (utilizationPercentage >= 90) {
            depot.status = 'critical';
          } else if (utilizationPercentage >= 70) {
            depot.status = 'warning';
          } else {
            depot.status = 'normal';
          }

          depot.updatedAt = new Date();
          await depot.save();
        }

        // Create stock alerts if needed
        await createStockAlert(product, userId);
        results.success++;

        console.log(` Processed product: ${product.name} (${product.sku}) - Final stock: ${product.stock}`);

      } catch (err) {
        results.failed++;
        results.errors.push({ sku, error: err.message });
        console.error(` Error processing product ${sku}:`, err.message);
      }
    }

    res.json({
      message: `Bulk import with transactions completed`,
      results
    });

  } catch (error) {
    console.error('Error in bulk import with transactions:', error);
    next(error);
  }
});

// GET - Get product details with full analytics
router.get('/:id/details', async (req, res, next) => {
  try {
    const userId = req.organizationId;
    const productId = req.params.id;
    const Transaction = require('../models/Transaction');

    const product = await Product.findOne({ _id: productId, userId });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Get all transactions for this product
    const transactions = await Transaction.find({
      userId,
      productId: productId
    }).sort({ timestamp: -1 });

    // Calculate analytics
    const now = new Date();
    const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

    const monthlyTransactions = transactions.filter(t => new Date(t.timestamp) >= oneMonthAgo);
    const weeklyTransactions = transactions.filter(t => new Date(t.timestamp) >= oneWeekAgo);
    const yearlyTransactions = transactions.filter(t => new Date(t.timestamp) >= oneYearAgo);

    const calculateStats = (txList) => {
      const stockIn = txList.filter(t => t.transactionType === 'stock-in').reduce((sum, t) => sum + t.quantity, 0);
      const stockOut = txList.filter(t => t.transactionType === 'stock-out').reduce((sum, t) => sum + t.quantity, 0);
      const transfers = txList.filter(t => t.transactionType === 'transfer').length;
      return { stockIn, stockOut, netChange: stockIn - stockOut, transfers, total: txList.length };
    };

    // Group transactions by month for chart data
    const monthlyData = {};
    yearlyTransactions.forEach(tx => {
      const month = new Date(tx.timestamp).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      if (!monthlyData[month]) {
        monthlyData[month] = { stockIn: 0, stockOut: 0, transfers: 0 };
      }
      if (tx.transactionType === 'stock-in') monthlyData[month].stockIn += tx.quantity;
      if (tx.transactionType === 'stock-out') monthlyData[month].stockOut += tx.quantity;
      if (tx.transactionType === 'transfer') monthlyData[month].transfers += 1;
    });

    const chartData = Object.keys(monthlyData).map(month => ({
      month,
      stockIn: monthlyData[month].stockIn,
      stockOut: monthlyData[month].stockOut,
      transfers: monthlyData[month].transfers
    }));

    res.json({
      product: {
        id: product._id,
        sku: product.sku,
        name: product.name,
        category: product.category,
        stock: product.stock,
        price: product.price,
        reorderPoint: product.reorderPoint,
        status: product.status,
        supplier: product.supplier,
        brand: product.brand,
        leadTime: product.leadTime,
        dailySales: product.dailySales,
        weeklySales: product.weeklySales,
        image: product.image,
        depotDistribution: product.depotDistribution || [],
        createdAt: product.createdAt,
        updatedAt: product.updatedAt
      },
      transactions: transactions.map(tx => ({
        id: tx._id,
        type: tx.transactionType,
        quantity: tx.quantity,
        timestamp: tx.timestamp,
        fromDepot: tx.fromDepot,
        toDepot: tx.toDepot,
        fromDepotId: tx.fromDepotId,
        toDepotId: tx.toDepotId,
        reason: tx.reason,
        performedBy: tx.performedBy,
        previousStock: tx.previousStock,
        newStock: tx.newStock
      })),
      analytics: {
        totalTransactions: transactions.length,
        monthlyStats: calculateStats(monthlyTransactions),
        weeklyStats: calculateStats(weeklyTransactions),
        yearlyStats: calculateStats(yearlyTransactions),
        chartData: chartData.reverse() // Oldest to newest for chart
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET - Get product by ID
router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.organizationId;
    const product = await Product.findOne({ _id: req.params.id, userId });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json({ product });
  } catch (error) {
    next(error);
  }
});

// PUT - Update product
router.put('/:id', async (req, res, next) => {
  try {
    const userId = req.organizationId;

    const product = await Product.findOne({ _id: req.params.id, userId });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Prevent Mass Assignment - Explicitly update allowed fields
    // NOTE: Stock is NOT updated here - use /products/:id/add-stock endpoint instead
    const { sku, name, category, reorderPoint, supplier, price, image, dailySales, weeklySales, brand, leadTime } = req.body;

    if (sku) product.sku = sku;
    if (name) product.name = name;
    if (category) product.category = category;
    // Stock modification removed - must use add-stock endpoint to maintain depot distribution integrity
    if (reorderPoint !== undefined) product.reorderPoint = reorderPoint;
    if (supplier) product.supplier = supplier;
    if (price !== undefined) product.price = price;
    if (image !== undefined) product.image = image;
    if (dailySales !== undefined) product.dailySales = dailySales;
    if (weeklySales !== undefined) product.weeklySales = weeklySales;
    if (brand) product.brand = brand;
    if (leadTime !== undefined) product.leadTime = leadTime;

    product.updatedAt = new Date();
    await product.save();
    await createStockAlert(product, userId);

    res.json({
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    next(error);
  }
});

// POST - Add stock to existing product (Manual Stock Addition)
router.post('/:id/add-stock', async (req, res, next) => {
  try {
    const userId = req.organizationId;
    const productId = req.params.id;
    const { depotId, quantity, reason } = req.body;

    // Validation
    if (!depotId) {
      return res.status(400).json({ message: 'Depot ID is required' });
    }

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ message: 'Quantity must be a positive number' });
    }

    // Find product
    const product = await Product.findOne({ _id: productId, userId });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Find depot
    const depot = await Depot.findOne({ _id: depotId, userId });
    if (!depot) {
      return res.status(404).json({ message: 'Depot not found' });
    }

    const stockToAdd = Number(quantity);
    const previousStock = product.stock || 0;

    // Update product depot distribution
    const existingDepotIndex = product.depotDistribution.findIndex(
      d => d.depotId.toString() === depotId.toString()
    );

    if (existingDepotIndex >= 0) {
      product.depotDistribution[existingDepotIndex].quantity += stockToAdd;
      product.depotDistribution[existingDepotIndex].lastUpdated = new Date();
    } else {
      product.depotDistribution.push({
        depotId: depot._id,
        depotName: depot.name,
        quantity: stockToAdd,
        lastUpdated: new Date()
      });
    }

    // Update depot's products array
    const depotProductIndex = depot.products.findIndex(
      p => p.productId.toString() === productId.toString()
    );

    if (depotProductIndex >= 0) {
      depot.products[depotProductIndex].quantity += stockToAdd;
      depot.products[depotProductIndex].lastUpdated = new Date();
    } else {
      depot.products.push({
        productId: product._id,
        productName: product.name,
        productSku: product.sku,
        quantity: stockToAdd,
        lastUpdated: new Date()
      });
    }

    // Save product (pre-save hook will recalculate total stock)
    product.updatedAt = new Date();
    await product.save();

    // Save depot with updated metrics
    await recalculateDepotMetrics(depot);
    await depot.save();

    // Create transaction record
    const transaction = new Transaction({
      userId,
      productId: product._id,
      productName: product.name,
      productSku: product.sku,
      transactionType: 'stock-in',
      quantity: stockToAdd,
      toDepot: depot.name,
      toDepotId: depot._id,
      previousStock: previousStock,
      newStock: product.stock, // This is now recalculated by pre-save hook
      reason: reason || 'Manual stock addition',
      performedBy: 'User',
      timestamp: new Date(),
      createdAt: new Date()
    });
    await transaction.save();

    // Update stock alerts
    await createStockAlert(product, userId);

    // Emit WebSocket event if available
    const io = req.app.get('io');
    if (io) {
      io.emit('product:stock-updated', {
        productId: product._id,
        productName: product.name,
        productSku: product.sku,
        newStock: product.stock,
        depotId: depot._id,
        depotName: depot.name
      });

      io.emit('transaction:created', {
        productId: product._id,
        productName: product.name,
        productSku: product.sku,
        transactionType: 'stock-in',
        quantity: stockToAdd,
        depotName: depot.name,
        depotId: depot._id
      });
    }

    res.json({
      message: 'Stock added successfully',
      product: {
        id: product._id,
        sku: product.sku,
        name: product.name,
        previousStock,
        newStock: product.stock,
        addedQuantity: stockToAdd,
        depot: depot.name
      }
    });
  } catch (error) {
    next(error);
  }
});
// DELETE - Delete product (MANAGER + ADMIN only)
router.delete('/:id', requirePermission('products:delete'), async (req, res, next) => {
  try {
    const userId = req.organizationId;
    const Alert = require('../models/Alert');

    const product = await Product.findOne({ _id: req.params.id, userId });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Get all depots that have this product
    const depotIds = product.depotDistribution.map(d => d.depotId);

    // Remove product from all depots' products arrays
    if (depotIds.length > 0) {
      await Depot.updateMany(
        { _id: { $in: depotIds }, userId },
        { $pull: { products: { productId: req.params.id } } }
      );

      // Recalculate metrics for each affected depot
      for (const depotId of depotIds) {
        const depot = await Depot.findById(depotId);
        if (depot) {
          await depot.save(); // Triggers pre-save hook to recalculate metrics
        }
      }
    }

    // Delete the product
    await Product.findByIdAndDelete(req.params.id);

    // Delete all alerts related to this product
    await Alert.deleteMany({ productId: req.params.id, userId });

    res.json({
      message: 'Product deleted successfully',
      depotsUpdated: depotIds.length
    });
  } catch (error) {
    next(error);
  }
});

// GET - Get all categories
router.get('/categories/list', async (req, res, next) => {
  try {
    const userId = req.organizationId;
    const categories = await Product.distinct('category', { userId });
    res.json({ categories });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
