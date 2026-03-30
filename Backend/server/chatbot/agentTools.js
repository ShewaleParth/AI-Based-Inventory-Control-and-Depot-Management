/**
 * Agent Tool Definitions & Executors
 * Lives in Backend/server/chatbot/ — uses direct model requires matching this server's schema.
 *
 * Schema field mapping:
 *   Product:     userId, name, sku, category, brand, stock, reorderPoint, status, price, supplier
 *   Depot:       userId, name, location, capacity, currentUtilization, status, products[]
 *   Transaction: userId, transactionType, productName, productSku, quantity, fromDepot, toDepot, timestamp
 *   Alert:       userId, type, category, title, description, severity, isResolved
 *   StockRequest: organizationId OR userId, product, productName, quantity, requestType, status, priority
 */

const mongoose = require('mongoose');
const Product     = require('../models/Product');
const Depot       = require('../models/Depot');
const Transaction = require('../models/Transaction');
const Alert       = require('../models/Alert');
const StockRequest = require('../models/StockRequest');

// Helper — cast organizationId to ObjectId for queries
function toObjId(id) {
  try {
    return mongoose.Types.ObjectId.isValid(id)
      ? new mongoose.Types.ObjectId(id.toString())
      : id;
  } catch { return id; }
}

// ─────────────────────────────────────────────
// Tool: get_low_stock_products
// ─────────────────────────────────────────────
const getLowStockProducts = {
  schema: {
    type: 'function',
    function: {
      name: 'get_low_stock_products',
      description: 'Retrieves all products that are at low-stock or out-of-stock status. Use when user asks what needs reordering, stock shortages, or low inventory levels.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Optional: filter by product category.' },
          limit: { type: 'integer', description: 'Max products to return. Default 20.', default: 20 }
        },
        required: []
      }
    }
  },
  execute: async ({ category, limit = 20 }, { organizationId }) => {
    try {
      const orgFilter = { userId: toObjId(organizationId) };
      const query = { ...orgFilter, status: { $in: ['low-stock', 'out-of-stock'] } };
      if (category) query.category = new RegExp(category, 'i');

      const products = await Product.find(query).sort({ stock: 1 }).limit(limit).lean();

      const formatted = products.map(p => ({
        name: p.name, sku: p.sku, category: p.category,
        stock: p.stock ?? 0, reorderPoint: p.reorderPoint ?? 0,
        status: p.status, price: p.price ?? 0,
        supplier: p.supplier || 'N/A'
      }));

      return {
        success: true,
        data: formatted,
        message: `Found ${formatted.length} low/out-of-stock product(s).`
      };
    } catch (e) {
      return { success: false, data: [], message: `Error: ${e.message}` };
    }
  }
};

// ─────────────────────────────────────────────
// Tool: get_depot_utilization
// ─────────────────────────────────────────────
const getDepotUtilization = {
  schema: {
    type: 'function',
    function: {
      name: 'get_depot_utilization',
      description: 'Returns capacity utilization % for each depot/warehouse. Use when user asks which depot has space, which is full, or for capacity analysis.',
      parameters: {
        type: 'object',
        properties: {
          sortBy: {
            type: 'string',
            enum: ['utilization_asc', 'utilization_desc', 'name'],
            description: 'Sort order. utilization_asc = most free space first.',
            default: 'utilization_desc'
          }
        },
        required: []
      }
    }
  },
  execute: async ({ sortBy = 'utilization_desc' }, { organizationId }) => {
    try {
      const depots = await Depot.find({ userId: toObjId(organizationId) }).lean();

      const results = depots.map(d => {
        const cap = d.capacity || 1;
        const used = d.currentUtilization ?? 0;
        return {
          name: d.name, location: d.location,
          status: d.status || 'active', capacity: cap,
          currentUtilization: used, free: cap - used,
          utilizationPercent: Math.round((used / cap) * 100),
          itemsStored: d.itemsStored ?? 0
        };
      });

      if (sortBy === 'utilization_asc') results.sort((a, b) => a.utilizationPercent - b.utilizationPercent);
      else if (sortBy === 'utilization_desc') results.sort((a, b) => b.utilizationPercent - a.utilizationPercent);
      else results.sort((a, b) => a.name.localeCompare(b.name));

      return { success: true, data: results, message: `Depot utilization for ${results.length} depot(s).` };
    } catch (e) {
      return { success: false, data: [], message: `Error: ${e.message}` };
    }
  }
};

// ─────────────────────────────────────────────
// Tool: calculate_reorder_quantity
// ─────────────────────────────────────────────
const calculateReorderQuantity = {
  schema: {
    type: 'function',
    function: {
      name: 'calculate_reorder_quantity',
      description: 'Calculates optimal reorder quantity for a product based on average consumption from recent transactions. Use when user asks how much to reorder.',
      parameters: {
        type: 'object',
        properties: {
          productName: { type: 'string', description: 'Name or partial name of the product.' },
          days: { type: 'integer', description: 'Past days to use for consumption calc. Default 30.', default: 30 }
        },
        required: ['productName']
      }
    }
  },
  execute: async ({ productName, days = 30 }, { organizationId }) => {
    try {
      const orgId = toObjId(organizationId);
      const product = await Product.findOne({ userId: orgId, name: new RegExp(productName, 'i') }).lean();
      if (!product) return { success: false, data: null, message: `Product "${productName}" not found.` };

      const since = new Date(Date.now() - days * 86400000);
      const transactions = await Transaction.find({
        userId: orgId,
        $or: [
          { productName: new RegExp(product.name, 'i') },
          { productSku: product.sku }
        ],
        transactionType: { $in: ['stock-out', 'transfer', 'sale'] },
        timestamp: { $gte: since }
      }).lean();

      const totalConsumed = transactions.reduce((s, t) => s + (t.quantity || 0), 0);
      const avgDaily = totalConsumed / days;
      const recommended = Math.ceil(avgDaily * 7 * 1.3); // 7-day lead time + 30% buffer

      return {
        success: true,
        data: {
          product: product.name, sku: product.sku,
          currentStock: product.stock ?? 0,
          reorderPoint: product.reorderPoint ?? 0,
          status: product.status,
          avgDailyConsumption: parseFloat(avgDaily.toFixed(2)),
          recommendedReorderQty: Math.max(recommended, product.reorderPoint ?? 10),
          basedOnDays: days
        },
        message: `Reorder recommendation calculated for ${product.name}.`
      };
    } catch (e) {
      return { success: false, data: null, message: `Error: ${e.message}` };
    }
  }
};

// ─────────────────────────────────────────────
// Tool: create_stock_request  [WRITE ⚡]
// ─────────────────────────────────────────────
const createStockRequest = {
  schema: {
    type: 'function',
    function: {
      name: 'create_stock_request',
      description: 'Creates a new stock reorder or transfer request. Use when user explicitly asks to reorder a product or request stock replenishment. Always confirm before calling.',
      parameters: {
        type: 'object',
        properties: {
          productName: { type: 'string', description: 'Name of the product.' },
          quantity:    { type: 'integer', description: 'Quantity to request.' },
          requestType: { type: 'string', enum: ['reorder', 'transfer'], default: 'reorder' },
          fromDepot:   { type: 'string', description: 'Source depot (transfers only).' },
          toDepot:     { type: 'string', description: 'Destination depot.' },
          priority:    { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
          notes:       { type: 'string', description: 'Optional notes.' }
        },
        required: ['productName', 'quantity']
      }
    }
  },
  requiresConfirmation: true,
  execute: async ({ productName, quantity, requestType = 'reorder', fromDepot, toDepot, priority = 'medium', notes }, { organizationId, userId }) => {
    try {
      const orgId = toObjId(organizationId);
      const product = await Product.findOne({ userId: orgId, name: new RegExp(productName, 'i') }).lean();
      if (!product) return { success: false, data: null, message: `Product "${productName}" not found.` };

      const request = new StockRequest({
        organizationId: orgId,
        requestedBy: toObjId(userId),
        product: product._id,
        productName: product.name,
        quantity,
        requestType,
        fromDepot: fromDepot || null,
        toDepot: toDepot || null,
        priority,
        status: 'pending',
        notes: notes || `Created by Sangrahak AI Agent`,
        createdAt: new Date()
      });

      await request.save();

      return {
        success: true,
        data: { requestId: request._id.toString(), product: product.name, quantity, requestType, priority, status: 'pending' },
        message: `✅ Stock request created for ${product.name} (Qty: ${quantity}, Priority: ${priority}).`
      };
    } catch (e) {
      return { success: false, data: null, message: `Failed to create request: ${e.message}` };
    }
  }
};

// ─────────────────────────────────────────────
// Tool: update_reorder_point  [WRITE ⚡]
// ─────────────────────────────────────────────
const updateReorderPoint = {
  schema: {
    type: 'function',
    function: {
      name: 'update_reorder_point',
      description: 'Updates the reorder threshold (reorderPoint) for a product. Use when user asks to change the minimum stock level. Always confirm before calling.',
      parameters: {
        type: 'object',
        properties: {
          productName:      { type: 'string', description: 'Name of the product.' },
          newReorderPoint: { type: 'integer', description: 'The new reorder threshold to set.' }
        },
        required: ['productName', 'newReorderPoint']
      }
    }
  },
  requiresConfirmation: true,
  execute: async ({ productName, newReorderPoint }, { organizationId }) => {
    try {
      const orgId = toObjId(organizationId);
      const product = await Product.findOneAndUpdate(
        { userId: orgId, name: new RegExp(productName, 'i') },
        { $set: { reorderPoint: newReorderPoint, updatedAt: new Date() } },
        { new: true }
      ).lean();

      if (!product) return { success: false, data: null, message: `Product "${productName}" not found.` };

      return {
        success: true,
        data: { product: product.name, sku: product.sku, newReorderPoint },
        message: `✅ Reorder point for "${product.name}" updated to ${newReorderPoint} units.`
      };
    } catch (e) {
      return { success: false, data: null, message: `Failed to update reorder point: ${e.message}` };
    }
  }
};

// ─────────────────────────────────────────────
// Tool: acknowledge_alerts  [WRITE ⚡]
// ─────────────────────────────────────────────
const acknowledgeAlerts = {
  schema: {
    type: 'function',
    function: {
      name: 'acknowledge_alerts',
      description: 'Marks alerts as resolved/acknowledged. Use when user wants to clear or dismiss alerts.',
      parameters: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'all'], default: 'all' }
        },
        required: []
      }
    }
  },
  requiresConfirmation: true,
  execute: async ({ severity = 'all' }, { organizationId }) => {
    try {
      const filter = { userId: toObjId(organizationId), isResolved: false };
      if (severity !== 'all') filter.severity = severity;

      const result = await Alert.updateMany(filter, { $set: { isResolved: true, resolvedAt: new Date() } });

      return {
        success: true,
        data: { acknowledged: result.modifiedCount, severity },
        message: `✅ ${result.modifiedCount} alert(s) acknowledged.`
      };
    } catch (e) {
      return { success: false, data: null, message: `Failed to acknowledge alerts: ${e.message}` };
    }
  }
};

// ─────────────────────────────────────────────
// Tool: generate_inventory_report
// ─────────────────────────────────────────────
const generateInventoryReport = {
  schema: {
    type: 'function',
    function: {
      name: 'generate_inventory_report',
      description: 'Generates a comprehensive inventory summary report including product health, depot status, recent transactions, and active alerts. Use when user asks for a report or overview.',
      parameters: {
        type: 'object',
        properties: {
          includeTransactions: { type: 'boolean', default: true }
        },
        required: []
      }
    }
  },
  execute: async ({ includeTransactions = true }, { organizationId }) => {
    try {
      const orgId = toObjId(organizationId);
      const orgFilter = { userId: orgId };

      const [total, lowStock, outOfStock, overStock, totalDepots, activeAlerts] = await Promise.all([
        Product.countDocuments(orgFilter),
        Product.countDocuments({ ...orgFilter, status: 'low-stock' }),
        Product.countDocuments({ ...orgFilter, status: 'out-of-stock' }),
        Product.countDocuments({ ...orgFilter, status: 'overstock' }),
        Depot.countDocuments(orgFilter),
        Alert.countDocuments({ ...orgFilter, isResolved: false })
      ]);

      const criticalItems = await Product.find({ ...orgFilter, status: { $in: ['low-stock', 'out-of-stock'] } })
        .sort({ stock: 1 }).limit(5).lean();

      const report = {
        generatedAt: new Date().toISOString(),
        inventory: { total, lowStock, outOfStock, overStock, healthy: total - lowStock - outOfStock - overStock },
        depots: { total: totalDepots },
        alerts: { active: activeAlerts },
        criticalItems: criticalItems.map(p => ({ name: p.name, sku: p.sku, stock: p.stock, reorderPoint: p.reorderPoint, status: p.status }))
      };

      if (includeTransactions) {
        try {
          const since = new Date(Date.now() - 7 * 86400000);
          const txCount = await Transaction.countDocuments({ ...orgFilter, timestamp: { $gte: since } });
          report.transactions = { lastSevenDays: txCount };
        } catch { report.transactions = { lastSevenDays: 'N/A' }; }
      }

      return { success: true, data: report, message: 'Inventory report generated.' };
    } catch (e) {
      return { success: false, data: null, message: `Failed to generate report: ${e.message}` };
    }
  }
};

// ─────────────────────────────────────────────
// Tool: transfer_stock_recommendation
// ─────────────────────────────────────────────
const transferStockRecommendation = {
  schema: {
    type: 'function',
    function: {
      name: 'transfer_stock_recommendation',
      description: 'Analyzes which depots have surplus stock of a product and recommends best transfer source. Use when user asks about stock balancing or transfer options.',
      parameters: {
        type: 'object',
        properties: {
          productName: { type: 'string', description: 'Name of the product to analyze.' }
        },
        required: ['productName']
      }
    }
  },
  execute: async ({ productName }, { organizationId }) => {
    try {
      const orgId = toObjId(organizationId);
      const product = await Product.findOne({ userId: orgId, name: new RegExp(productName, 'i') }).lean();
      if (!product) return { success: false, data: null, message: `Product "${productName}" not found.` };

      const depots = await Depot.find({ userId: orgId }).lean();

      const recommendations = depots
        .map(d => {
          const match = (d.products || []).find(p =>
            p.productName?.toLowerCase() === product.name.toLowerCase() ||
            p.productSku === product.sku
          );
          const qty = match?.quantity ?? 0;
          const surplus = qty - (product.reorderPoint ?? 0);
          return {
            depotName: d.name, location: d.location,
            stockLevel: qty, surplus: Math.max(surplus, 0),
            canTransfer: surplus > 0
          };
        })
        .sort((a, b) => b.surplus - a.surplus);

      return {
        success: true,
        data: { product: product.name, sku: product.sku, recommendations },
        message: `Transfer analysis complete for ${product.name}.`
      };
    } catch (e) {
      return { success: false, data: null, message: `Error: ${e.message}` };
    }
  }
};

// ─────────────────────────────────────────────
// Tool Registry
// ─────────────────────────────────────────────
const TOOLS = {
  get_low_stock_products:        getLowStockProducts,
  get_depot_utilization:         getDepotUtilization,
  calculate_reorder_quantity:    calculateReorderQuantity,
  create_stock_request:          createStockRequest,
  update_reorder_point:          updateReorderPoint,
  acknowledge_alerts:            acknowledgeAlerts,
  generate_inventory_report:     generateInventoryReport,
  transfer_stock_recommendation: transferStockRecommendation
};

const TOOL_SCHEMAS = Object.values(TOOLS).map(t => t.schema);

module.exports = { TOOLS, TOOL_SCHEMAS };
