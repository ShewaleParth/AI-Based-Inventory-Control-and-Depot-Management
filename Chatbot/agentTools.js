/**
 * Agent Tool Definitions & Executors
 *
 * Each tool has:
 *  - schema: JSON Schema sent to Groq's function-calling API
 *  - execute(params, context): performs the actual action, returns { success, data, message }
 *
 * context = { organizationId, userId }
 */

const mongoose = require('mongoose');
const getModel = (name) => mongoose.model(name);

// ─────────────────────────────────────────────
// Tool: get_low_stock_products
// ─────────────────────────────────────────────
const getLowStockProducts = {
  schema: {
    type: 'function',
    function: {
      name: 'get_low_stock_products',
      description: 'Retrieves all products that are at or below their minimum stock level (low stock or out of stock). Use this when the user asks about stock shortages, what to reorder, or low inventory.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Optional: filter by product category (e.g. "Grains", "Spices"). Omit to get all categories.'
          },
          limit: {
            type: 'integer',
            description: 'Max number of products to return. Default 20.',
            default: 20
          }
        },
        required: []
      }
    }
  },
  execute: async ({ category, limit = 20 }, { organizationId }) => {
    try {
      const Product = getModel('Product');
      const query = {
        organizationId,
        $expr: { $lte: ['$currentStock', '$minStockLevel'] }
      };
      if (category) query.category = new RegExp(category, 'i');

      const products = await Product.find(query)
        .sort({ currentStock: 1 })
        .limit(limit)
        .lean();

      const formatted = products.map(p => ({
        name: p.name,
        sku: p.sku,
        category: p.category,
        currentStock: p.currentStock ?? 0,
        minStockLevel: p.minStockLevel ?? 0,
        unit: p.unit || 'units',
        price: p.price || 0,
        status: (p.currentStock ?? 0) <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK'
      }));

      return {
        success: true,
        data: formatted,
        message: `Found ${formatted.length} low-stock product(s).`
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
      description: 'Returns capacity utilization percentage for each depot/warehouse. Use this when the user asks which depot has space, which is full, or needs capacity analysis.',
      parameters: {
        type: 'object',
        properties: {
          sortBy: {
            type: 'string',
            enum: ['utilization_asc', 'utilization_desc', 'name'],
            description: 'How to sort results. utilization_asc = most free space first.',
            default: 'utilization_desc'
          }
        },
        required: []
      }
    }
  },
  execute: async ({ sortBy = 'utilization_desc' }, { organizationId }) => {
    try {
      const Depot = getModel('Depot');
      const depots = await Depot.find({ organizationId }).lean();

      const results = depots.map(d => {
        const capacity = d.capacity || 1;
        const used = d.currentLoad ?? d.usedCapacity ?? 0;
        const utilization = Math.round((used / capacity) * 100);
        return {
          name: d.name,
          location: d.location,
          status: d.status || 'active',
          capacity,
          used,
          free: capacity - used,
          utilizationPercent: utilization
        };
      });

      if (sortBy === 'utilization_asc') results.sort((a, b) => a.utilizationPercent - b.utilizationPercent);
      else if (sortBy === 'utilization_desc') results.sort((a, b) => b.utilizationPercent - a.utilizationPercent);
      else results.sort((a, b) => a.name.localeCompare(b.name));

      return {
        success: true,
        data: results,
        message: `Depot utilization data for ${results.length} depot(s).`
      };
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
      description: 'Calculates the optimal reorder quantity for a product based on average consumption from recent transactions. Use this when the user wants to know how much to reorder.',
      parameters: {
        type: 'object',
        properties: {
          productName: {
            type: 'string',
            description: 'Name or partial name of the product to calculate reorder for.'
          },
          days: {
            type: 'integer',
            description: 'Number of past days to use for consumption calculation. Default 30.',
            default: 30
          }
        },
        required: ['productName']
      }
    }
  },
  execute: async ({ productName, days = 30 }, { organizationId }) => {
    try {
      const Product = getModel('Product');
      const Transaction = getModel('Transaction');

      const product = await Product.findOne({
        organizationId,
        name: new RegExp(productName, 'i')
      }).lean();

      if (!product) {
        return { success: false, data: null, message: `Product "${productName}" not found.` };
      }

      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const transactions = await Transaction.find({
        organizationId,
        $or: [
          { productName: new RegExp(product.name, 'i') },
          { product: product._id }
        ],
        type: { $in: ['sale', 'outbound', 'transfer', 'dispatch'] },
        createdAt: { $gte: since }
      }).lean();

      const totalConsumed = transactions.reduce((sum, t) => sum + (t.quantity || 0), 0);
      const avgDailyConsumption = totalConsumed / days;
      const leadTimeDays = 7; // standard lead time assumption
      const safetyFactor = 1.3; // 30% safety buffer
      const recommendedQty = Math.ceil(avgDailyConsumption * leadTimeDays * safetyFactor);

      return {
        success: true,
        data: {
          product: product.name,
          sku: product.sku,
          currentStock: product.currentStock ?? 0,
          minStockLevel: product.minStockLevel ?? 0,
          avgDailyConsumption: parseFloat(avgDailyConsumption.toFixed(2)),
          recommendedReorderQty: Math.max(recommendedQty, product.minStockLevel ?? 10),
          unit: product.unit || 'units',
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
// Tool: create_stock_request  [WRITE]
// ─────────────────────────────────────────────
const createStockRequest = {
  schema: {
    type: 'function',
    function: {
      name: 'create_stock_request',
      description: 'Creates a new stock request (reorder or transfer) in the system. Use this when the user explicitly asks to reorder a product, request stock replenishment, or initiate a stock transfer between depots. ALWAYS confirm with the user before calling this.',
      parameters: {
        type: 'object',
        properties: {
          productName: {
            type: 'string',
            description: 'Name of the product to reorder.'
          },
          quantity: {
            type: 'integer',
            description: 'Quantity to request.'
          },
          requestType: {
            type: 'string',
            enum: ['reorder', 'transfer'],
            description: 'Type of request. reorder = from supplier, transfer = between depots.',
            default: 'reorder'
          },
          fromDepot: {
            type: 'string',
            description: 'Source depot name (only for transfers).'
          },
          toDepot: {
            type: 'string',
            description: 'Destination depot name.'
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'urgent'],
            description: 'Priority level of the request.',
            default: 'medium'
          },
          notes: {
            type: 'string',
            description: 'Optional notes or reason for the request.'
          }
        },
        required: ['productName', 'quantity']
      }
    }
  },
  requiresConfirmation: true,
  execute: async ({ productName, quantity, requestType = 'reorder', fromDepot, toDepot, priority = 'medium', notes }, { organizationId, userId }) => {
    try {
      const Product = getModel('Product');
      const StockRequest = getModel('StockRequest');

      const product = await Product.findOne({
        organizationId,
        name: new RegExp(productName, 'i')
      }).lean();

      if (!product) {
        return { success: false, data: null, message: `Product "${productName}" not found. Please check the product name.` };
      }

      const request = new StockRequest({
        organizationId,
        requestedBy: userId,
        product: product._id,
        productName: product.name,
        quantity,
        requestType,
        fromDepot: fromDepot || null,
        toDepot: toDepot || null,
        priority,
        status: 'pending',
        notes: notes || `Created by Sangrahak AI — ${requestType} request`,
        createdAt: new Date()
      });

      await request.save();

      return {
        success: true,
        data: {
          requestId: request._id.toString(),
          product: product.name,
          quantity,
          requestType,
          priority,
          status: 'pending'
        },
        message: `✅ Stock request created successfully for ${product.name} (Qty: ${quantity}).`
      };
    } catch (e) {
      return { success: false, data: null, message: `Failed to create stock request: ${e.message}` };
    }
  }
};

// ─────────────────────────────────────────────
// Tool: update_reorder_point  [WRITE]
// ─────────────────────────────────────────────
const updateReorderPoint = {
  schema: {
    type: 'function',
    function: {
      name: 'update_reorder_point',
      description: 'Updates the minimum stock level (reorder point) for a product. Use this when the user explicitly asks to change or set the reorder threshold for a product. ALWAYS confirm with the user before calling this.',
      parameters: {
        type: 'object',
        properties: {
          productName: {
            type: 'string',
            description: 'Name of the product to update.'
          },
          newMinStockLevel: {
            type: 'integer',
            description: 'The new minimum stock level (reorder point) to set.'
          }
        },
        required: ['productName', 'newMinStockLevel']
      }
    }
  },
  requiresConfirmation: true,
  execute: async ({ productName, newMinStockLevel }, { organizationId }) => {
    try {
      const Product = getModel('Product');

      const product = await Product.findOneAndUpdate(
        { organizationId, name: new RegExp(productName, 'i') },
        { $set: { minStockLevel: newMinStockLevel, updatedAt: new Date() } },
        { new: true }
      ).lean();

      if (!product) {
        return { success: false, data: null, message: `Product "${productName}" not found.` };
      }

      return {
        success: true,
        data: {
          product: product.name,
          sku: product.sku,
          oldMinLevel: product.minStockLevel,
          newMinLevel: newMinStockLevel
        },
        message: `✅ Reorder point for "${product.name}" updated to ${newMinStockLevel} ${product.unit || 'units'}.`
      };
    } catch (e) {
      return { success: false, data: null, message: `Failed to update reorder point: ${e.message}` };
    }
  }
};

// ─────────────────────────────────────────────
// Tool: acknowledge_alerts  [WRITE]
// ─────────────────────────────────────────────
const acknowledgeAlerts = {
  schema: {
    type: 'function',
    function: {
      name: 'acknowledge_alerts',
      description: 'Marks alerts as read/acknowledged in the system. Use this when the user wants to clear, dismiss, or acknowledge alerts. Can target all alerts or by severity.',
      parameters: {
        type: 'object',
        properties: {
          severity: {
            type: 'string',
            enum: ['critical', 'high', 'medium', 'low', 'all'],
            description: 'Which severity level to acknowledge. Use "all" to acknowledge everything.',
            default: 'all'
          }
        },
        required: []
      }
    }
  },
  requiresConfirmation: true,
  execute: async ({ severity = 'all' }, { organizationId }) => {
    try {
      const Alert = getModel('Alert');
      const filter = { organizationId, isRead: false };
      if (severity !== 'all') filter.severity = severity;

      const result = await Alert.updateMany(filter, {
        $set: { isRead: true, resolvedAt: new Date() }
      });

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
      description: 'Generates a comprehensive inventory summary report including total products, low stock items, depot utilization, recent transaction volume, and active alerts. Use this when the user asks for a report, summary, or overview.',
      parameters: {
        type: 'object',
        properties: {
          includeTransactions: {
            type: 'boolean',
            description: 'Whether to include recent transaction summary. Default true.',
            default: true
          }
        },
        required: []
      }
    }
  },
  execute: async ({ includeTransactions = true }, { organizationId }) => {
    try {
      const Product = getModel('Product');
      const Depot = getModel('Depot');
      const Alert = getModel('Alert');

      const [totalProducts, lowStock, outOfStock, totalDepots, activeAlerts] = await Promise.all([
        Product.countDocuments({ organizationId }),
        Product.countDocuments({ organizationId, $expr: { $lte: ['$currentStock', '$minStockLevel'] } }),
        Product.countDocuments({ organizationId, currentStock: { $lte: 0 } }),
        Depot.countDocuments({ organizationId }),
        Alert.countDocuments({ organizationId, isRead: false })
      ]);

      // Top 5 low stock items
      const criticalItems = await Product.find({
        organizationId,
        $expr: { $lte: ['$currentStock', '$minStockLevel'] }
      }).sort({ currentStock: 1 }).limit(5).lean();

      const report = {
        generatedAt: new Date().toISOString(),
        inventory: { totalProducts, lowStock, outOfStock, healthyStock: totalProducts - lowStock },
        depots: { total: totalDepots },
        alerts: { active: activeAlerts },
        criticalItems: criticalItems.map(p => ({
          name: p.name, sku: p.sku,
          currentStock: p.currentStock ?? 0,
          minStockLevel: p.minStockLevel ?? 0
        }))
      };

      if (includeTransactions) {
        try {
          const Transaction = getModel('Transaction');
          const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          const txCount = await Transaction.countDocuments({ organizationId, createdAt: { $gte: since } });
          report.transactions = { lastSevenDays: txCount };
        } catch (e) {
          report.transactions = { lastSevenDays: 'N/A' };
        }
      }

      return {
        success: true,
        data: report,
        message: 'Inventory report generated successfully.'
      };
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
      description: 'Analyzes depot stock levels and recommends which depot to transfer stock FROM (has surplus) for a given product. Use this when user asks about stock balancing or optimal transfer sources.',
      parameters: {
        type: 'object',
        properties: {
          productName: {
            type: 'string',
            description: 'Name of the product to analyze for transfer recommendations.'
          }
        },
        required: ['productName']
      }
    }
  },
  execute: async ({ productName }, { organizationId }) => {
    try {
      const DepotStock = getModel('DepotStock');
      const Product = getModel('Product');
      const Depot = getModel('Depot');

      const product = await Product.findOne({
        organizationId,
        name: new RegExp(productName, 'i')
      }).lean();

      if (!product) {
        return { success: false, data: null, message: `Product "${productName}" not found.` };
      }

      const depotStocks = await DepotStock.find({
        organizationId,
        product: product._id
      }).lean();

      if (!depotStocks.length) {
        return {
          success: true,
          data: { product: product.name, recommendations: [] },
          message: `No per-depot stock data found for ${product.name}.`
        };
      }

      // Get depot names
      const depotIds = depotStocks.map(ds => ds.depot);
      const depots = await Depot.find({ _id: { $in: depotIds } }).lean();
      const depotMap = Object.fromEntries(depots.map(d => [d._id.toString(), d]));

      const recommendations = depotStocks
        .map(ds => {
          const depot = depotMap[ds.depot?.toString()];
          const surplus = (ds.quantity ?? 0) - (product.minStockLevel ?? 0);
          return {
            depotName: depot?.name || 'Unknown',
            location: depot?.location || 'N/A',
            stockLevel: ds.quantity ?? 0,
            surplus: Math.max(surplus, 0),
            canTransfer: surplus > 0
          };
        })
        .sort((a, b) => b.surplus - a.surplus);

      return {
        success: true,
        data: {
          product: product.name,
          unit: product.unit || 'units',
          recommendations
        },
        message: `Transfer analysis complete for ${product.name}.`
      };
    } catch (e) {
      return { success: false, data: null, message: `Error: ${e.message}` };
    }
  }
};

// ─────────────────────────────────────────────
// Tool Registry — exported for use in agentEngine
// ─────────────────────────────────────────────
const TOOLS = {
  get_low_stock_products: getLowStockProducts,
  get_depot_utilization: getDepotUtilization,
  calculate_reorder_quantity: calculateReorderQuantity,
  create_stock_request: createStockRequest,
  update_reorder_point: updateReorderPoint,
  acknowledge_alerts: acknowledgeAlerts,
  generate_inventory_report: generateInventoryReport,
  transfer_stock_recommendation: transferStockRecommendation
};

// All tool schemas for Groq function-calling
const TOOL_SCHEMAS = Object.values(TOOLS).map(t => t.schema);

module.exports = { TOOLS, TOOL_SCHEMAS };
