/**
 * RAG Pipeline — Context Retrieval from MongoDB
 *
 * Uses EXACT field names from each Mongoose schema:
 *   Product:     userId, stock, reorderPoint, status, name, sku, category, brand, price, supplier
 *   Depot:       userId, name, location, capacity, currentUtilization, itemsStored, status, products[]
 *   Transaction: userId, transactionType, productName, productSku, quantity, fromDepot, toDepot, timestamp
 *   Alert:       userId, type, category, title, description, severity, isRead
 *
 * Data is scoped by `organizationId` which maps to `userId` in each model
 * (admins' userId IS their organizationId; staff have their admin's userId as organizationId)
 */

const mongoose = require('mongoose');
const Product = require('../models/Product');
const Depot = require('../models/Depot');
const Transaction = require('../models/Transaction');
const Alert = require('../models/Alert');

function extractKeywords(query) {
  const stopWords = new Set([
    'the','a','an','is','are','was','were','be','been','being','have','has','had',
    'do','does','did','will','would','could','should','may','might','must','shall',
    'can','what','which','who','whom','this','that','these','those','i','me','my',
    'we','our','you','your','he','she','it','they','all','both','each','few','more',
    'most','other','some','no','not','only','same','so','than','too','very','just',
    'show','tell','give','list','find','get','how','many','much','in','on','at',
    'by','for','with','about','of','to','from','and','or','but','if','then','else',
    'when','where','why'
  ]);
  return query.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

function buildRegex(keywords) {
  return keywords.length ? new RegExp(keywords.join('|'), 'i') : null;
}

function detectIntent(query) {
  const q = query.toLowerCase();
  return {
    wantsProducts: /product|item|stock|inventory|sku|category|brand|price|quantity|low.?stock|out.?of.?stock|reorder/i.test(q),
    wantsDepots:   /depot|warehouse|location|facility|capacity|utilization|active/i.test(q),
    wantsTx:       /transaction|movement|transfer|sale|purchase|history|recent|latest|stock.?in|stock.?out/i.test(q),
    wantsAlerts:   /alert|warning|critical|urgent|expir|shortage|danger|anomaly/i.test(q),
    wantsStats:    /total|count|sum|average|avg|how many|how much|statistic|summary|overview/i.test(q),
  };
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatProducts(products) {
  if (!products.length) return '';
  const rows = products.map(p => {
    const statusIcon = p.status === 'out-of-stock' ? '🔴' : p.status === 'low-stock' ? '🟡' : p.status === 'overstock' ? '🟠' : '🟢';
    
    // Add depot distribution details so LLM knows WHERE products are stored
    const locations = p.depotDistribution && p.depotDistribution.length 
      ? ` | Stored in: ${p.depotDistribution.map(d => `${d.depotName} (${d.quantity})`).join(', ')}`
      : ' | Stored in: None';

    return `• ${p.name} | SKU: ${p.sku} | Category: ${p.category} | Stock: ${p.stock} units | Reorder at: ${p.reorderPoint} | Status: ${statusIcon} ${p.status} | Price: ₹${p.price} | Supplier: ${p.supplier || 'N/A'}${locations}`;
  });
  return `PRODUCTS (${products.length} results):\n${rows.join('\n')}`;
}

function formatDepots(depots) {
  if (!depots.length) return '';
  const rows = depots.map(d => {
    const pct = d.capacity > 0 ? ((d.currentUtilization / d.capacity) * 100).toFixed(1) : 0;
    
    // List top 5 items stored in this depot to give LLM context on WHAT is inside
    const topItems = d.products && d.products.length
      ? ` | Top items here: ${d.products.sort((a,b) => b.quantity - a.quantity).slice(0, 5).map(p => `${p.productName} (${p.quantity})`).join(', ')}`
      : ' | Empty';

    return `• ${d.name} | Location: ${d.location} | Capacity: ${d.capacity} | Used: ${d.currentUtilization} (${pct}%) | SKUs stored: ${d.itemsStored} | Status: ${d.status}${topItems}`;
  });
  return `DEPOTS (${depots.length} results):\n${rows.join('\n')}`;
}

function formatTransactions(transactions) {
  if (!transactions.length) return '';
  const rows = transactions.map(t => {
    const date = new Date(t.timestamp || t.createdAt).toLocaleDateString();
    const dir = t.fromDepot && t.toDepot ? ` | ${t.fromDepot} → ${t.toDepot}` : t.toDepot ? ` | To: ${t.toDepot}` : t.fromDepot ? ` | From: ${t.fromDepot}` : '';
    return `• [${date}] ${t.transactionType} | ${t.productName} (${t.productSku}) | Qty: ${t.quantity}${dir}`;
  });
  return `RECENT TRANSACTIONS (${transactions.length} results):\n${rows.join('\n')}`;
}

function formatAlerts(alerts) {
  if (!alerts.length) return '';
  const rows = alerts.map(a => {
    const icon = a.category === 'critical' ? '🔴' : a.category === 'warning' ? '🟡' : 'ℹ️';
    return `• ${icon} [${a.severity?.toUpperCase()}] ${a.title}: ${a.description}`;
  });
  return `ACTIVE ALERTS (${alerts.length} unresolved):\n${rows.join('\n')}`;
}

// ── Main retrieval function ───────────────────────────────────────────────────

/**
 * Retrieve relevant context from MongoDB for a user query.
 * @param {string} query
 * @param {string|ObjectId} organizationId — maps to userId in all models
 */
async function retrieveContext(query, organizationId, limit = 20) {
  const intent = detectIntent(query);
  const keywords = extractKeywords(query);
  const regex = buildRegex(keywords);

  // Cast organizationId to ObjectId to match how routes store it (req.organizationId → userId)
  let orgId;
  try {
    orgId = mongoose.Types.ObjectId.isValid(organizationId)
      ? new mongoose.Types.ObjectId(organizationId.toString())
      : organizationId;
  } catch {
    orgId = organizationId;
  }

  // All models scope data using `userId` = organizationId
  const orgFilter = { userId: orgId };
  const contextParts = [];
  const errors = [];

  // ── 1. Always include inventory summary stats ─────────────────────────────
  try {
    const [total, lowStock, outOfStock, overStock] = await Promise.all([
      Product.countDocuments(orgFilter),
      Product.countDocuments({ ...orgFilter, status: 'low-stock' }),
      Product.countDocuments({ ...orgFilter, status: 'out-of-stock' }),
      Product.countDocuments({ ...orgFilter, status: 'overstock' }),
    ]);
    contextParts.push(
      `INVENTORY SUMMARY:\n• Total Products: ${total} | Low Stock: ${lowStock} | Out of Stock: ${outOfStock} | Overstock: ${overStock} | In Stock: ${total - lowStock - outOfStock - overStock}`
    );
  } catch (e) {
    errors.push(`Stats error: ${e.message}`);
  }

  // ── 2. Products ───────────────────────────────────────────────────────────
  // ALWAYS search products if there's a keyword search (regex), regardless of intent
  if (intent.wantsProducts || intent.wantsStats || keywords.length === 0 || regex) {
    try {
      let q = { ...orgFilter };

      if (/out.?of.?stock/i.test(query)) {
        q.status = 'out-of-stock';
      } else if (/low.?stock|reorder/i.test(query)) {
        q.status = { $in: ['low-stock', 'out-of-stock'] };
      } else if (/overstock/i.test(query)) {
        q.status = 'overstock';
      } else if (regex) {
        q.$or = [{ name: regex }, { category: regex }, { sku: regex }, { brand: regex }, { supplier: regex }];
      }

      const products = await Product.find(q)
        .sort({ stock: 1 }) // show lowest stock first
        .limit(limit)
        .lean();

      if (products.length) contextParts.push(formatProducts(products));
      else contextParts.push('PRODUCTS: No products matched the query criteria.');
    } catch (e) { errors.push(`Products error: ${e.message}`); }
  }

  // ── 3. Depots ─────────────────────────────────────────────────────────────
  // ALWAYS search depots if there's a keyword search (regex), regardless of intent
  if (intent.wantsDepots || keywords.length === 0 || regex) {
    try {
      let q = { ...orgFilter };
      if (regex) q.$or = [{ name: regex }, { location: regex }];

      const depots = await Depot.find(q)
        .sort({ currentUtilization: -1 })
        .limit(limit)
        .lean();

      if (depots.length) contextParts.push(formatDepots(depots));
      // Silently skip if no depots — don't add noise to context
    } catch (e) { errors.push(`Depots error: ${e.message}`); }
  }

  // ── 4. Transactions ───────────────────────────────────────────────────────
  // Transactions are expensive to search via dumb regex, so rely on intent or specific keywords
  if (intent.wantsTx || intent.wantsStats || keywords.length === 0) {
    try {
      let q = { ...orgFilter };
      if (/stock.?in/i.test(query)) q.transactionType = 'stock-in';
      else if (/stock.?out/i.test(query)) q.transactionType = 'stock-out';
      else if (/transfer/i.test(query)) q.transactionType = 'transfer';
      else if (regex) q.$or = [{ productName: regex }, { productSku: regex }];

      const transactions = await Transaction.find(q)
        .sort({ timestamp: -1 })
        .limit(15)
        .lean();

      // Also try fetching ALL transactions (no type filter) if targeted search returned nothing
      if (!transactions.length) {
        const allTx = await Transaction.find(orgFilter).sort({ timestamp: -1 }).limit(15).lean();
        if (allTx.length) contextParts.push(formatTransactions(allTx));
      } else {
        contextParts.push(formatTransactions(transactions));
      }
    } catch (e) { errors.push(`Transactions error: ${e.message}`); }
  }

  // ── 5. Alerts ─────────────────────────────────────────────────────────────
  if (intent.wantsAlerts || keywords.length === 0) {
    try {
      const alerts = await Alert.find({ ...orgFilter, isResolved: false })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      if (alerts.length) contextParts.push(formatAlerts(alerts));
    } catch (e) { /* alerts are non-critical */ }
  }

  return {
    context: contextParts.join('\n\n'),
    errors: errors.length ? errors : null
  };
}

module.exports = { retrieveContext };
