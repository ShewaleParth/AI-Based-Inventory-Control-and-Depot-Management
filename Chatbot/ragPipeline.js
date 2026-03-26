/**
 * RAG Pipeline — Context Retrieval from MongoDB
 *
 * Retrieves relevant documents from MongoDB collections based on the user's query.
 * Uses keyword matching + recency to surface the most relevant inventory context.
 */

const mongoose = require('mongoose');

// Dynamically load models (they're registered on mongoose when server starts)
const getModel = (name) => mongoose.model(name);

/**
 * Extract keywords from user query for matching
 */
function extractKeywords(query) {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
    'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they',
    'all', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'not', 'only', 'same', 'so', 'than', 'too', 'very', 'just',
    'show', 'tell', 'give', 'list', 'find', 'get', 'how', 'many', 'much',
    'in', 'on', 'at', 'by', 'for', 'with', 'about', 'of', 'to', 'from',
    'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'why'
  ]);

  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

/**
 * Build a MongoDB text search regex from keywords
 */
function buildSearchRegex(keywords) {
  if (!keywords.length) return null;
  return new RegExp(keywords.join('|'), 'i');
}

/**
 * Detect intent from query to decide what to retrieve
 */
function detectIntent(query) {
  const lower = query.toLowerCase();
  return {
    wantsProducts: /product|item|stock|inventory|sku|category|brand|price|quantity|low.?stock|out.?of.?stock/i.test(lower),
    wantsDepots: /depot|warehouse|location|facility|store|capacity/i.test(lower),
    wantsTransactions: /transaction|movement|transfer|sale|purchase|history|recent|latest|order/i.test(lower),
    wantsAlerts: /alert|warning|critical|urgent|expir|low|shortage|danger/i.test(lower),
    wantsForecast: /forecast|predict|future|demand|trend/i.test(lower),
    wantsStats: /total|count|sum|average|avg|how many|how much|statistic|summary/i.test(lower),
  };
}

/**
 * Format products into readable context text
 */
function formatProducts(products) {
  if (!products.length) return '';
  const lines = products.map(p => {
    const stock = p.currentStock ?? p.quantity ?? 0;
    const min = p.minStockLevel ?? p.reorderPoint ?? 0;
    const status = stock <= 0 ? '🔴 OUT OF STOCK' : stock <= min ? '🟡 LOW STOCK' : '🟢 OK';
    return `• ${p.name} | SKU: ${p.sku || 'N/A'} | Category: ${p.category || 'N/A'} | ` +
           `Stock: ${stock} ${p.unit || 'units'} | Min: ${min} | Status: ${status} | ` +
           `Price: ₹${p.price || 0}`;
  });
  return `PRODUCTS (${products.length}):\n${lines.join('\n')}`;
}

/**
 * Format depots into readable context text
 */
function formatDepots(depots) {
  if (!depots.length) return '';
  const lines = depots.map(d =>
    `• ${d.name} | Location: ${d.location || 'N/A'} | ` +
    `Capacity: ${d.capacity || 'N/A'} | Status: ${d.status || 'active'}`
  );
  return `DEPOTS (${depots.length}):\n${lines.join('\n')}`;
}

/**
 * Format transactions into readable context text
 */
function formatTransactions(transactions) {
  if (!transactions.length) return '';
  const lines = transactions.map(t =>
    `• [${new Date(t.date || t.createdAt).toLocaleDateString()}] ` +
    `${t.type || t.transactionType || 'transaction'} — ` +
    `${t.productName || t.product || 'Product'} | Qty: ${t.quantity || 0} | ` +
    `${t.fromDepot ? `From: ${t.fromDepot}` : ''} ${t.toDepot ? `→ To: ${t.toDepot}` : ''}`
  );
  return `RECENT TRANSACTIONS (${transactions.length}):\n${lines.join('\n')}`;
}

/**
 * Format alerts into readable context text
 */
function formatAlerts(alerts) {
  if (!alerts.length) return '';
  const lines = alerts.map(a =>
    `• [${a.severity?.toUpperCase() || 'INFO'}] ${a.message || a.title || 'Alert'} ` +
    `| ${new Date(a.createdAt || a.timestamp || Date.now()).toLocaleDateString()}`
  );
  return `ACTIVE ALERTS (${alerts.length}):\n${lines.join('\n')}`;
}

/**
 * Main retrieval function — pulls relevant context for a user query
 * @param {string} query — user's message
 * @param {ObjectId} organizationId — for data isolation
 * @param {number} limit — max docs per collection
 */
async function retrieveContext(query, organizationId, limit = 15) {
  const intent = detectIntent(query);
  const keywords = extractKeywords(query);
  const regex = buildSearchRegex(keywords);

  const orgFilter = { organizationId };
  const contextParts = [];
  const errors = [];

  // Always include high-level stats for better context
  try {
    const Product = getModel('Product');
    const totalProducts = await Product.countDocuments(orgFilter);
    const lowStockCount = await Product.countDocuments({
      ...orgFilter,
      $expr: { $lte: ['$currentStock', '$minStockLevel'] }
    });
    const outOfStock = await Product.countDocuments({ ...orgFilter, currentStock: { $lte: 0 } });
    contextParts.push(
      `INVENTORY SUMMARY:\n• Total Products: ${totalProducts} | Low Stock: ${lowStockCount} | Out of Stock: ${outOfStock}`
    );
  } catch (e) {
    errors.push(`Stats error: ${e.message}`);
  }

  // Fetch products
  if (intent.wantsProducts || intent.wantsStats || keywords.length === 0) {
    try {
      const Product = getModel('Product');
      let productQuery = { ...orgFilter };

      // Priority: low/out-of-stock if asking about that
      if (/low.?stock|out.?of.?stock|shortage/i.test(query)) {
        productQuery.$expr = { $lte: ['$currentStock', '$minStockLevel'] };
      } else if (regex) {
        productQuery.$or = [
          { name: regex },
          { category: regex },
          { sku: regex },
          { brand: regex }
        ];
      }

      const products = await Product.find(productQuery)
        .sort({ currentStock: 1 })
        .limit(limit)
        .lean();

      if (products.length) contextParts.push(formatProducts(products));
    } catch (e) {
      errors.push(`Products error: ${e.message}`);
    }
  }

  // Fetch depots
  if (intent.wantsDepots || keywords.length === 0) {
    try {
      const Depot = getModel('Depot');
      let depotQuery = { ...orgFilter };
      if (regex) {
        depotQuery.$or = [{ name: regex }, { location: regex }];
      }
      const depots = await Depot.find(depotQuery).limit(limit).lean();
      if (depots.length) contextParts.push(formatDepots(depots));
    } catch (e) {
      errors.push(`Depots error: ${e.message}`);
    }
  }

  // Fetch recent transactions
  if (intent.wantsTransactions || intent.wantsStats) {
    try {
      const Transaction = getModel('Transaction');
      let txQuery = { ...orgFilter };
      if (regex) {
        txQuery.$or = [{ productName: regex }, { type: regex }];
      }
      const transactions = await Transaction.find(txQuery)
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();
      if (transactions.length) contextParts.push(formatTransactions(transactions));
    } catch (e) {
      errors.push(`Transactions error: ${e.message}`);
    }
  }

  // Fetch alerts
  if (intent.wantsAlerts || keywords.length === 0) {
    try {
      const Alert = getModel('Alert');
      const alerts = await Alert.find({ ...orgFilter, isRead: false })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();
      if (alerts.length) contextParts.push(formatAlerts(alerts));
    } catch (e) {
      // Alerts might not exist, that's fine
    }
  }

  return {
    context: contextParts.join('\n\n'),
    errors: errors.length ? errors : null
  };
}

module.exports = { retrieveContext, detectIntent, extractKeywords };
