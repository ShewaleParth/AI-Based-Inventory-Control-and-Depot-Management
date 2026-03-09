const Groq = require('groq-sdk');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

class AIReportService {

  // ═══════════════════════════════════════════════════
  //  INVENTORY REPORTS
  // ═══════════════════════════════════════════════════

  async analyzeInventorySummary(products, depots, transactions) {
    const totalValue = products.reduce((sum, p) => sum + ((p.stock || 0) * (p.price || 0)), 0);
    const lowStock = products.filter(p => (p.stock || 0) < (p.reorderPoint || 50));
    const outOfStock = products.filter(p => (p.stock || 0) === 0);
    const overstock = products.filter(p => (p.stock || 0) > (p.reorderPoint || 50) * 3);
    const categoryMap = this.groupByCategory(products);
    const totalStock = products.reduce((s, p) => s + (p.stock || 0), 0);

    const stockInQty = transactions.filter(t => t.transactionType === 'stock-in').reduce((s, t) => s + (t.quantity || 0), 0);
    const stockOutQty = transactions.filter(t => t.transactionType === 'stock-out').reduce((s, t) => s + (t.quantity || 0), 0);

    const prompt = `You are a senior inventory management consultant. Analyze this COMPLETE INVENTORY SUMMARY with precision.

INVENTORY SNAPSHOT:
- Total Products (SKUs): ${products.length}
- Total Units in Stock: ${totalStock.toLocaleString()}
- Total Inventory Value: Rs ${totalValue.toLocaleString()}
- Average Price per Unit: Rs ${products.length > 0 ? Math.round(totalValue / totalStock) : 0}

STOCK HEALTH BREAKDOWN:
- Healthy (In Stock): ${products.filter(p => p.status === 'in-stock').length} products
- Low Stock (Below Reorder Point): ${lowStock.length} products (${products.length > 0 ? ((lowStock.length / products.length) * 100).toFixed(1) : 0}%)
- Out of Stock: ${outOfStock.length} products (${products.length > 0 ? ((outOfStock.length / products.length) * 100).toFixed(1) : 0}%)
- Overstock (>3x Reorder Point): ${overstock.length} products (${products.length > 0 ? ((overstock.length / products.length) * 100).toFixed(1) : 0}%)

CATEGORY BREAKDOWN (by value):
${Object.entries(categoryMap).map(([cat, items]) => {
      const catValue = items.reduce((s, i) => s + ((i.stock || 0) * (i.price || 0)), 0);
      const catStock = items.reduce((s, i) => s + (i.stock || 0), 0);
      return `- ${cat}: ${items.length} products, ${catStock} units, Rs ${catValue.toLocaleString()} value`;
    }).join('\n')}

DEPOT DISTRIBUTION:
- Total Depots: ${depots.length}
${depots.map(d => `- ${d.name} (${d.location}): ${d.currentUtilization}/${d.capacity} units (${d.capacity > 0 ? ((d.currentUtilization / d.capacity) * 100).toFixed(1) : 0}%)`).join('\n')}

MOVEMENT (Last 30 Days):
- Stock-In: ${stockInQty.toLocaleString()} units across ${transactions.filter(t => t.transactionType === 'stock-in').length} operations
- Stock-Out: ${stockOutQty.toLocaleString()} units across ${transactions.filter(t => t.transactionType === 'stock-out').length} operations
- Net Flow: ${stockInQty - stockOutQty > 0 ? '+' : ''}${(stockInQty - stockOutQty).toLocaleString()} units
- Transfers: ${transactions.filter(t => t.transactionType === 'transfer').length} operations

TOP 5 MOST VALUABLE PRODUCTS:
${products.sort((a, b) => ((b.stock || 0) * (b.price || 0)) - ((a.stock || 0) * (a.price || 0))).slice(0, 5).map((p, i) =>
      `${i + 1}. ${p.name} (${p.sku}) - ${p.stock} units x Rs ${p.price} = Rs ${((p.stock || 0) * (p.price || 0)).toLocaleString()}`
    ).join('\n')}

TOP 5 LOW STOCK ITEMS NEEDING ATTENTION:
${lowStock.sort((a, b) => (a.stock || 0) - (b.stock || 0)).slice(0, 5).map((p, i) =>
      `${i + 1}. ${p.name} (${p.sku}) - Current: ${p.stock} units, Reorder Point: ${p.reorderPoint}, Daily Sales: ${p.dailySales || 'N/A'}`
    ).join('\n')}

Provide a DETAILED, DATA-DRIVEN analysis. For every problem identified, provide a SPECIFIC SOLUTION with exact numbers.

Return JSON: { "executiveSummary": "3-4 sentences with exact numbers", "keyInsights": ["4-5 specific insights referencing actual data"], "recommendations": ["4-5 actionable steps with specific quantities and timelines"], "alerts": ["critical issues requiring immediate action"], "metrics": {"efficiencyScore": "0-100", "healthStatus": "Excellent/Good/Fair/Poor", "riskLevel": "Low/Medium/High", "inventoryTurnover": "rate", "stockoutRisk": "percentage"} }`;

    return await this.callGroqAPI(prompt, 'senior inventory management consultant specializing in stock optimization, demand planning, and supply chain efficiency');
  }

  async analyzeStockLevels(products, depots) {
    const byStatus = {
      inStock: products.filter(p => p.status === 'in-stock'),
      lowStock: products.filter(p => p.status === 'low-stock'),
      outOfStock: products.filter(p => p.status === 'out-of-stock'),
      overstock: products.filter(p => p.status === 'overstock')
    };

    const byDepot = {};
    depots.forEach(d => {
      const depotProducts = products.filter(p =>
        p.depotDistribution?.some(dist => dist.depotId?.toString() === d._id.toString())
      );
      const depotStock = depotProducts.reduce((s, p) => {
        const dist = p.depotDistribution?.find(dd => dd.depotId?.toString() === d._id.toString());
        return s + (dist?.quantity || 0);
      }, 0);
      byDepot[d.name] = { products: depotProducts.length, stock: depotStock, capacity: d.capacity, utilization: d.currentUtilization };
    });

    const prompt = `You are a stock level analysis expert. Provide PRECISE stock level analysis.

STOCK STATUS DISTRIBUTION:
- In Stock (Healthy): ${byStatus.inStock.length} products (${byStatus.inStock.reduce((s, p) => s + (p.stock || 0), 0)} units)
- Low Stock: ${byStatus.lowStock.length} products (${byStatus.lowStock.reduce((s, p) => s + (p.stock || 0), 0)} units)
- Out of Stock: ${byStatus.outOfStock.length} products
- Overstock: ${byStatus.overstock.length} products (${byStatus.overstock.reduce((s, p) => s + (p.stock || 0), 0)} units)

STOCK BY DEPOT:
${Object.entries(byDepot).map(([name, data]) =>
      `- ${name}: ${data.products} products, ${data.stock} units, Capacity: ${data.utilization}/${data.capacity} (${data.capacity > 0 ? ((data.utilization / data.capacity) * 100).toFixed(1) : 0}%)`
    ).join('\n')}

CRITICAL LOW STOCK ITEMS (need reorder):
${byStatus.lowStock.sort((a, b) => (a.stock || 0) - (b.stock || 0)).slice(0, 10).map((p, i) =>
      `${i + 1}. ${p.name} (${p.sku}): Stock=${p.stock}, ReorderPt=${p.reorderPoint}, DailySales=${p.dailySales || 'N/A'}, Supplier=${p.supplier}`
    ).join('\n')}

OVERSTOCK ITEMS (excess inventory):
${byStatus.overstock.slice(0, 5).map((p, i) =>
      `${i + 1}. ${p.name} (${p.sku}): Stock=${p.stock}, ReorderPt=${p.reorderPoint}, Value=Rs ${((p.stock || 0) * (p.price || 0)).toLocaleString()}`
    ).join('\n')}

For each problem, provide SPECIFIC SOLUTIONS: exact reorder quantities, transfer suggestions between depots, and timeline recommendations.

Return JSON: { "executiveSummary", "keyInsights" (5 items with data), "recommendations" (5 actionable with quantities), "alerts", "metrics": {"efficiencyScore", "healthStatus", "riskLevel", "reorderUrgency": "count of items needing immediate reorder"} }`;

    return await this.callGroqAPI(prompt, 'warehouse stock level analyst with expertise in inventory optimization and reorder planning');
  }

  async analyzeLowStock(products) {
    const critical = products.filter(p => (p.stock || 0) === 0);
    const urgent = products.filter(p => (p.stock || 0) > 0 && (p.stock || 0) <= (p.reorderPoint || 50) * 0.3);
    const warning = products.filter(p => (p.stock || 0) > (p.reorderPoint || 50) * 0.3 && (p.stock || 0) < (p.reorderPoint || 50));

    const totalLostRevenue = critical.reduce((s, p) => s + ((p.dailySales || 5) * (p.price || 0) * 7), 0);

    const prompt = `You are a supply chain risk analyst. Analyze these LOW STOCK items with urgency assessment.

SEVERITY BREAKDOWN:
- CRITICAL (Out of Stock): ${critical.length} items - Revenue at risk: Rs ${totalLostRevenue.toLocaleString()}/week
- URGENT (Below 30% of reorder point): ${urgent.length} items
- WARNING (Below reorder point): ${warning.length} items
- Total At-Risk Items: ${products.length}

CRITICAL OUT-OF-STOCK ITEMS (IMMEDIATE ACTION REQUIRED):
${critical.slice(0, 10).map((p, i) =>
      `${i + 1}. ${p.name} (${p.sku}) | Category: ${p.category} | Supplier: ${p.supplier} | Daily Sales: ${p.dailySales || 5} units | Price: Rs ${p.price} | Lead Time: ${p.leadTime || 7} days | ESTIMATED DAILY REVENUE LOSS: Rs ${((p.dailySales || 5) * (p.price || 0)).toLocaleString()}`
    ).join('\n')}

URGENT LOW STOCK ITEMS:
${urgent.slice(0, 10).map((p, i) =>
      `${i + 1}. ${p.name} (${p.sku}) | Stock: ${p.stock} | Reorder Pt: ${p.reorderPoint} | Days of Stock Left: ${p.dailySales > 0 ? Math.floor(p.stock / p.dailySales) : 'N/A'} | Supplier: ${p.supplier}`
    ).join('\n')}

WARNING ITEMS:
${warning.slice(0, 10).map((p, i) =>
      `${i + 1}. ${p.name} (${p.sku}) | Stock: ${p.stock} | Reorder Pt: ${p.reorderPoint} | Days Left: ${p.dailySales > 0 ? Math.floor(p.stock / p.dailySales) : 'N/A'}`
    ).join('\n')}

For EACH critical item, calculate exact reorder quantity using: ReorderQty = (DailySales x LeadTime x 1.5 SafetyFactor) - CurrentStock.
Provide SPECIFIC purchase order recommendations with supplier names and quantities.

Return JSON: { "executiveSummary" (include total revenue at risk), "keyInsights" (5 data-driven), "recommendations" (5 with exact reorder quantities per item), "alerts" (each critical item), "metrics": {"efficiencyScore", "healthStatus", "riskLevel", "estimatedRevenueLoss": "weekly amount", "itemsNeedingReorder": "count"} }`;

    return await this.callGroqAPI(prompt, 'supply chain risk analyst specializing in stockout prevention and emergency procurement');
  }

  async analyzeStockMovement(transactions, products) {
    const stockIn = transactions.filter(t => t.transactionType === 'stock-in');
    const stockOut = transactions.filter(t => t.transactionType === 'stock-out');
    const transfers = transactions.filter(t => t.transactionType === 'transfer');
    const adjustments = transactions.filter(t => t.transactionType === 'adjustment');

    // Daily breakdown
    const dailyActivity = {};
    transactions.forEach(t => {
      const day = new Date(t.timestamp).toLocaleDateString('en-IN');
      if (!dailyActivity[day]) dailyActivity[day] = { in: 0, out: 0, transfers: 0 };
      if (t.transactionType === 'stock-in') dailyActivity[day].in += (t.quantity || 0);
      if (t.transactionType === 'stock-out') dailyActivity[day].out += (t.quantity || 0);
      if (t.transactionType === 'transfer') dailyActivity[day].transfers += (t.quantity || 0);
    });

    // Top moving products
    const productMovement = {};
    transactions.forEach(t => {
      const key = t.productName || t.productSku;
      if (!productMovement[key]) productMovement[key] = { in: 0, out: 0, total: 0 };
      productMovement[key].total += (t.quantity || 0);
      if (t.transactionType === 'stock-in') productMovement[key].in += (t.quantity || 0);
      if (t.transactionType === 'stock-out') productMovement[key].out += (t.quantity || 0);
    });

    const topMovers = Object.entries(productMovement).sort((a, b) => b[1].total - a[1].total).slice(0, 10);

    const prompt = `You are a logistics and movement analytics expert. Analyze stock movement patterns in detail.

MOVEMENT SUMMARY (Last 30 Days):
- Total Transactions: ${transactions.length}
- Stock-In: ${stockIn.length} operations, ${stockIn.reduce((s, t) => s + (t.quantity || 0), 0).toLocaleString()} units
- Stock-Out: ${stockOut.length} operations, ${stockOut.reduce((s, t) => s + (t.quantity || 0), 0).toLocaleString()} units
- Transfers: ${transfers.length} operations, ${transfers.reduce((s, t) => s + (t.quantity || 0), 0).toLocaleString()} units
- Adjustments: ${adjustments.length} operations
- Net Flow: ${(stockIn.reduce((s, t) => s + (t.quantity || 0), 0) - stockOut.reduce((s, t) => s + (t.quantity || 0), 0)).toLocaleString()} units
- Daily Average Transactions: ${(transactions.length / 30).toFixed(1)}

TOP 10 MOST ACTIVE PRODUCTS:
${topMovers.map(([name, data], i) =>
      `${i + 1}. ${name}: Total Movement=${data.total} units (In=${data.in}, Out=${data.out})`
    ).join('\n')}

DAILY ACTIVITY PATTERN (last 7 days):
${Object.entries(dailyActivity).slice(0, 7).map(([day, data]) =>
      `- ${day}: In=${data.in} units, Out=${data.out} units, Transfers=${data.transfers} units`
    ).join('\n')}

MOVEMENT BY DEPOT (transfers):
${transfers.slice(0, 10).map((t, i) =>
      `${i + 1}. ${t.productName}: ${t.quantity} units from "${t.fromDepot || 'N/A'}" to "${t.toDepot || 'N/A'}"`
    ).join('\n')}

Identify patterns: peak days, slow-moving vs fast-moving products, transfer efficiency. Provide solutions for optimizing movement.

Return JSON: { "executiveSummary", "keyInsights" (5), "recommendations" (5 with specific optimization actions), "alerts", "metrics": {"efficiencyScore", "healthStatus", "riskLevel", "dailyAvgMovement": "units", "peakDay": "day name"} }`;

    return await this.callGroqAPI(prompt, 'logistics analytics expert specializing in stock movement optimization and warehouse flow management');
  }

  // ═══════════════════════════════════════════════════
  //  DEPOT REPORTS
  // ═══════════════════════════════════════════════════

  async analyzeDepotData(depotData, transactions, products) {
    const utilizationPercent = depotData.capacity > 0 ? ((depotData.currentUtilization / depotData.capacity) * 100).toFixed(1) : 0;
    const totalValue = products.reduce((sum, p) => sum + ((p.stock || 0) * (p.price || 0)), 0);

    const stockInCount = transactions.filter(t => t.transactionType === 'stock-in').length;
    const stockOutCount = transactions.filter(t => t.transactionType === 'stock-out').length;
    const transferCount = transactions.filter(t => t.transactionType === 'transfer').length;
    const stockInQty = transactions.filter(t => t.transactionType === 'stock-in').reduce((s, t) => s + (t.quantity || 0), 0);
    const stockOutQty = transactions.filter(t => t.transactionType === 'stock-out').reduce((s, t) => s + (t.quantity || 0), 0);

    const lowStockItems = products.filter(p => (p.stock || 0) < (p.reorderPoint || 50));
    const outOfStockItems = products.filter(p => (p.stock || 0) === 0);

    const prompt = `You are a warehouse operations expert. Analyze this SPECIFIC DEPOT in detail.

DEPOT: ${depotData.name}
LOCATION: ${depotData.location}

CAPACITY METRICS:
- Total Capacity: ${depotData.capacity.toLocaleString()} units
- Current Utilization: ${depotData.currentUtilization.toLocaleString()} units (${utilizationPercent}%)
- Available Space: ${(depotData.capacity - depotData.currentUtilization).toLocaleString()} units
- Total SKUs: ${products.length}
- Total Value Stored: Rs ${totalValue.toLocaleString()}

OPERATIONS (Last 30 Days):
- Stock-In: ${stockInCount} ops, ${stockInQty.toLocaleString()} units received
- Stock-Out: ${stockOutCount} ops, ${stockOutQty.toLocaleString()} units dispatched
- Transfers: ${transferCount} ops
- Net Flow: ${stockInQty - stockOutQty > 0 ? '+' : ''}${(stockInQty - stockOutQty).toLocaleString()} units
- Throughput Rate: ${(stockInQty + stockOutQty).toLocaleString()} units total handled

INVENTORY HEALTH AT THIS DEPOT:
- Healthy Items: ${products.length - lowStockItems.length - outOfStockItems.length}
- Low Stock: ${lowStockItems.length} items
- Out of Stock: ${outOfStockItems.length} items

TOP PRODUCTS IN THIS DEPOT:
${products.sort((a, b) => (b.stock || 0) - (a.stock || 0)).slice(0, 8).map((p, i) =>
      `${i + 1}. ${p.name || p.productName} (${p.sku || 'N/A'}) - ${p.stock || 0} units, Rs ${((p.stock || 0) * (p.price || 0)).toLocaleString()}`
    ).join('\n')}

LOW STOCK ITEMS AT THIS DEPOT:
${lowStockItems.slice(0, 5).map((p, i) =>
      `${i + 1}. ${p.name || p.productName} - Stock: ${p.stock || 0}, Reorder: ${p.reorderPoint}`
    ).join('\n')}

${utilizationPercent > 85 ? 'WARNING: This depot is approaching maximum capacity!' : ''}
${outOfStockItems.length > 0 ? `ALERT: ${outOfStockItems.length} items are OUT OF STOCK at this depot!` : ''}

Provide depot-specific solutions: capacity optimization, stock rebalancing with other depots, operational improvements.

Return JSON: { "executiveSummary" (specific to this depot), "keyInsights" (5 depot-specific), "recommendations" (5 actionable for this depot), "alerts", "metrics": {"efficiencyScore": "0-100", "healthStatus", "riskLevel", "throughputRate": "units/day", "spaceUtilization": "percentage"} }`;

    return await this.callGroqAPI(prompt, 'warehouse operations expert specializing in depot performance optimization and capacity planning');
  }

  async analyzeCapacity(depots, products) {
    const totalCapacity = depots.reduce((s, d) => s + (d.capacity || 0), 0);
    const totalUtilization = depots.reduce((s, d) => s + (d.currentUtilization || 0), 0);

    const prompt = `You are a capacity planning expert. Analyze depot capacity across the entire network.

NETWORK OVERVIEW:
- Total Depots: ${depots.length}
- Total Capacity: ${totalCapacity.toLocaleString()} units
- Total Utilization: ${totalUtilization.toLocaleString()} units (${totalCapacity > 0 ? ((totalUtilization / totalCapacity) * 100).toFixed(1) : 0}%)
- Available Space: ${(totalCapacity - totalUtilization).toLocaleString()} units

DEPOT-BY-DEPOT BREAKDOWN:
${depots.map(d => {
      const pct = d.capacity > 0 ? ((d.currentUtilization / d.capacity) * 100).toFixed(1) : 0;
      return `- ${d.name} (${d.location}): ${d.currentUtilization}/${d.capacity} units (${pct}%) | Status: ${d.status} | SKUs: ${d.products?.length || 0}`;
    }).join('\n')}

CRITICAL DEPOTS:
${depots.filter(d => d.status === 'critical' || d.status === 'warning').map(d =>
      `- ${d.name}: ${d.status.toUpperCase()} - ${d.capacity > 0 ? ((d.currentUtilization / d.capacity) * 100).toFixed(1) : 0}% utilized`
    ).join('\n') || 'None'}

Suggest specific stock transfers between depots to balance utilization. Include expansion recommendations where needed.

Return JSON: { "executiveSummary", "keyInsights" (5), "recommendations" (5 with specific transfer suggestions), "alerts", "metrics": {"efficiencyScore", "healthStatus", "riskLevel", "networkUtilization": "percentage", "depotsAtRisk": "count"} }`;

    return await this.callGroqAPI(prompt, 'capacity planning specialist with expertise in multi-site warehouse network optimization');
  }

  async compareDepots(depots, products, transactions) {
    const comparison = depots.map(d => {
      const depotProducts = products.filter(p =>
        p.depotDistribution?.some(dist => dist.depotId?.toString() === d._id.toString())
      );
      const depotValue = depotProducts.reduce((s, p) => {
        const dist = p.depotDistribution?.find(dd => dd.depotId?.toString() === d._id.toString());
        return s + ((dist?.quantity || 0) * (p.price || 0));
      }, 0);
      const depotTrans = transactions.filter(t =>
        t.fromDepotId?.toString() === d._id.toString() || t.toDepotId?.toString() === d._id.toString()
      );
      return {
        name: d.name, location: d.location,
        products: depotProducts.length,
        value: depotValue,
        utilization: d.capacity > 0 ? ((d.currentUtilization / d.capacity) * 100).toFixed(1) : 0,
        transactions: depotTrans.length,
        capacity: d.capacity,
        used: d.currentUtilization
      };
    });

    const prompt = `You are a multi-site operations analyst. Compare these depots side-by-side.

DEPOT COMPARISON:
${comparison.map((c, i) =>
      `${i + 1}. ${c.name} (${c.location}):\n   - SKUs: ${c.products} | Value: Rs ${c.value.toLocaleString()} | Capacity: ${c.used}/${c.capacity} (${c.utilization}%)\n   - Transactions (30d): ${c.transactions} | Status: ${c.utilization > 90 ? 'CRITICAL' : c.utilization > 75 ? 'WARNING' : 'NORMAL'}`
    ).join('\n')}

RANKINGS:
- Most Utilized: ${comparison.sort((a, b) => parseFloat(b.utilization) - parseFloat(a.utilization))[0]?.name || 'N/A'}
- Highest Value: ${comparison.sort((a, b) => b.value - a.value)[0]?.name || 'N/A'}
- Most Active: ${comparison.sort((a, b) => b.transactions - a.transactions)[0]?.name || 'N/A'}
- Most Products: ${comparison.sort((a, b) => b.products - a.products)[0]?.name || 'N/A'}

Provide specific recommendations for rebalancing inventory between depots. Identify best-performing and underperforming depots.

Return JSON: { "executiveSummary", "keyInsights" (5 comparative), "recommendations" (5 with transfer/rebalance actions), "alerts", "metrics": {"efficiencyScore", "healthStatus", "riskLevel", "bestPerformer": "depot name", "needsAttention": "depot name"} }`;

    return await this.callGroqAPI(prompt, 'multi-site operations analyst specializing in depot benchmarking and network optimization');
  }

  // ═══════════════════════════════════════════════════
  //  FINANCIAL REPORTS
  // ═══════════════════════════════════════════════════

  async analyzeValuation(products, depots) {
    const totalValue = products.reduce((sum, p) => sum + ((p.stock || 0) * (p.price || 0)), 0);
    const categoryValues = Object.entries(this.groupByCategory(products)).map(([cat, items]) => ({
      category: cat,
      value: items.reduce((s, i) => s + ((i.stock || 0) * (i.price || 0)), 0),
      stock: items.reduce((s, i) => s + (i.stock || 0), 0),
      items: items.length,
      avgPrice: items.length > 0 ? Math.round(items.reduce((s, i) => s + (i.price || 0), 0) / items.length) : 0
    })).sort((a, b) => b.value - a.value);

    const prompt = `You are a financial inventory analyst. Provide PRECISE inventory valuation analysis.

TOTAL INVENTORY VALUATION: Rs ${totalValue.toLocaleString()}
Total Products: ${products.length}
Total Units: ${products.reduce((s, p) => s + (p.stock || 0), 0).toLocaleString()}

VALUE BY CATEGORY:
${categoryValues.map((c, i) =>
      `${i + 1}. ${c.category}: Rs ${c.value.toLocaleString()} (${totalValue > 0 ? ((c.value / totalValue) * 100).toFixed(1) : 0}% of total) | ${c.items} items | ${c.stock} units | Avg Price: Rs ${c.avgPrice}`
    ).join('\n')}

TOP 10 HIGHEST VALUE PRODUCTS:
${products.sort((a, b) => ((b.stock || 0) * (b.price || 0)) - ((a.stock || 0) * (a.price || 0))).slice(0, 10).map((p, i) =>
      `${i + 1}. ${p.name} (${p.sku}): ${p.stock} units x Rs ${p.price} = Rs ${((p.stock || 0) * (p.price || 0)).toLocaleString()} | Status: ${p.status}`
    ).join('\n')}

VALUE AT RISK (Low Stock + Out of Stock):
${products.filter(p => p.status === 'low-stock' || p.status === 'out-of-stock').slice(0, 5).map((p, i) =>
      `${i + 1}. ${p.name}: Status=${p.status}, Potential daily revenue loss=Rs ${((p.dailySales || 5) * (p.price || 0)).toLocaleString()}`
    ).join('\n')}

VALUE DISTRIBUTION BY DEPOT:
${depots.map(d => {
      const depotValue = products.reduce((s, p) => {
        const dist = p.depotDistribution?.find(dd => dd.depotId?.toString() === d._id.toString());
        return s + ((dist?.quantity || 0) * (p.price || 0));
      }, 0);
      return `- ${d.name}: Rs ${depotValue.toLocaleString()}`;
    }).join('\n')}

Identify value concentration risks, suggest diversification, and flag working capital optimization opportunities.

Return JSON: { "executiveSummary", "keyInsights" (5 with Rs values), "recommendations" (5 financial actions), "alerts", "metrics": {"efficiencyScore", "healthStatus", "riskLevel", "totalValuation": "formatted", "valueAtRisk": "formatted", "topCategory": "name"} }`;

    return await this.callGroqAPI(prompt, 'financial inventory analyst specializing in working capital optimization and inventory valuation');
  }

  async analyzeCosts(products, transactions, depots) {
    const holdingCost = products.reduce((s, p) => s + ((p.stock || 0) * (p.price || 0) * 0.02), 0);
    const transactionCost = transactions.length * 50;
    const totalCost = holdingCost + transactionCost;
    const totalValue = products.reduce((s, p) => s + ((p.stock || 0) * (p.price || 0)), 0);
    const overstockCost = products.filter(p => p.status === 'overstock').reduce((s, p) => s + ((p.stock || 0) * (p.price || 0) * 0.02), 0);

    const prompt = `You are a cost optimization specialist. Analyze operational costs with specific savings opportunities.

COST BREAKDOWN (Monthly Estimates):
- Holding/Carrying Costs (2% of inventory value): Rs ${holdingCost.toLocaleString()}
- Transaction Processing Costs (Rs 50/transaction): Rs ${transactionCost.toLocaleString()}
- Total Operational Costs: Rs ${totalCost.toLocaleString()}
- Cost as % of Inventory Value: ${totalValue > 0 ? ((totalCost / totalValue) * 100).toFixed(2) : 0}%

COST DRIVERS:
- Overstock Holding Cost (wasted capital): Rs ${overstockCost.toLocaleString()}/month
- Number of Depots: ${depots.length} (each with fixed overhead)
- Total Transactions (30d): ${transactions.length}
- Inventory Value: Rs ${totalValue.toLocaleString()}

Provide SPECIFIC cost reduction strategies with estimated savings in Rs.

Return JSON: { "executiveSummary", "keyInsights" (5 with Rs values), "recommendations" (5 with estimated Rs savings each), "alerts", "metrics": {"efficiencyScore", "healthStatus", "riskLevel", "monthlyOpCost": "formatted", "potentialSavings": "formatted"} }`;

    return await this.callGroqAPI(prompt, 'cost optimization specialist focused on inventory carrying costs and operational efficiency');
  }

  async analyzeProfitLoss(products, transactions) {
    const stockOutTxns = transactions.filter(t => t.transactionType === 'stock-out');
    const revenue = stockOutTxns.reduce((s, t) => {
      const product = products.find(p => p._id?.toString() === t.productId?.toString());
      return s + ((t.quantity || 0) * (product?.price || 150));
    }, 0);
    const holdingCosts = products.reduce((s, p) => s + ((p.stock || 0) * (p.price || 0) * 0.02), 0);
    const operatingCosts = transactions.length * 50;
    const totalCosts = holdingCosts + operatingCosts;
    const profit = revenue - totalCosts;

    const prompt = `You are a financial performance analyst. Analyze profit & loss with actionable improvement strategies.

P&L STATEMENT (Last 30 Days):
REVENUE:
- Sales Revenue (stock-out transactions): Rs ${revenue.toLocaleString()}
- Total Sales Transactions: ${stockOutTxns.length}
- Average Transaction Value: Rs ${stockOutTxns.length > 0 ? Math.round(revenue / stockOutTxns.length).toLocaleString() : 0}

COSTS:
- Inventory Holding Costs: Rs ${holdingCosts.toLocaleString()}
- Operating/Transaction Costs: Rs ${operatingCosts.toLocaleString()}
- Total Costs: Rs ${totalCosts.toLocaleString()}

BOTTOM LINE:
- Gross Profit: Rs ${profit.toLocaleString()}
- Profit Margin: ${revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0}%
- Cost-to-Revenue Ratio: ${revenue > 0 ? ((totalCosts / revenue) * 100).toFixed(1) : 'N/A'}%

LOST REVENUE OPPORTUNITY:
- Out of Stock Items: ${products.filter(p => p.status === 'out-of-stock').length}
- Est. Daily Lost Revenue: Rs ${products.filter(p => p.status === 'out-of-stock').reduce((s, p) => s + ((p.dailySales || 5) * (p.price || 0)), 0).toLocaleString()}

Provide strategies to increase revenue and reduce costs with SPECIFIC Rs targets.

Return JSON: { "executiveSummary", "keyInsights" (5 financial), "recommendations" (5 with Rs impact), "alerts", "metrics": {"efficiencyScore", "healthStatus", "riskLevel", "profitMargin": "percentage", "revenue": "formatted", "potentialRevenue": "formatted"} }`;

    return await this.callGroqAPI(prompt, 'financial performance analyst specializing in inventory-driven P&L optimization');
  }

  // ═══════════════════════════════════════════════════
  //  ANALYTICS REPORTS
  // ═══════════════════════════════════════════════════

  async analyzeTrendData(transactions, products) {
    const last7 = transactions.filter(t => new Date(t.timestamp) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const last30 = transactions;
    const dailyAvg7 = (last7.length / 7).toFixed(1);
    const dailyAvg30 = (last30.length / 30).toFixed(1);
    const growthRate = dailyAvg30 > 0 ? (((dailyAvg7 / dailyAvg30) - 1) * 100).toFixed(1) : 0;

    const prompt = `You are a data analytics and forecasting expert. Analyze trends and predict future patterns.

TREND ANALYSIS:
- Last 7 Days: ${last7.length} transactions (${dailyAvg7}/day avg)
- Last 30 Days: ${last30.length} transactions (${dailyAvg30}/day avg)
- Growth Rate (7d vs 30d): ${growthRate}%
- Trend Direction: ${growthRate > 5 ? 'INCREASING' : growthRate < -5 ? 'DECREASING' : 'STABLE'}

VOLUME TRENDS:
- 7-Day Stock-In Volume: ${last7.filter(t => t.transactionType === 'stock-in').reduce((s, t) => s + (t.quantity || 0), 0)} units
- 7-Day Stock-Out Volume: ${last7.filter(t => t.transactionType === 'stock-out').reduce((s, t) => s + (t.quantity || 0), 0)} units
- 30-Day Stock-In Volume: ${last30.filter(t => t.transactionType === 'stock-in').reduce((s, t) => s + (t.quantity || 0), 0)} units
- 30-Day Stock-Out Volume: ${last30.filter(t => t.transactionType === 'stock-out').reduce((s, t) => s + (t.quantity || 0), 0)} units

PRODUCT VELOCITY:
${products.sort((a, b) => (b.dailySales || 0) - (a.dailySales || 0)).slice(0, 5).map((p, i) =>
      `${i + 1}. ${p.name}: Daily Sales=${p.dailySales || 0}, Weekly=${p.weeklySales || 0}, Stock=${p.stock}`
    ).join('\n')}

Provide trend projections for next 7 and 30 days. Identify seasonality patterns and anomalies.

Return JSON: { "executiveSummary", "keyInsights" (5 trend-focused), "recommendations" (5 proactive), "alerts", "metrics": {"efficiencyScore", "healthStatus", "riskLevel", "trendDirection": "up/down/stable", "projectedNextWeek": "transaction count"} }`;

    return await this.callGroqAPI(prompt, 'data analytics expert specializing in inventory trend analysis, demand forecasting, and predictive analytics');
  }

  async analyzeForecastAccuracy(products) {
    const totalStock = products.reduce((s, p) => s + (p.stock || 0), 0);
    const avgStock = products.length > 0 ? totalStock / products.length : 0;
    const variance = products.length > 0 ? products.reduce((s, p) => s + Math.pow((p.stock || 0) - avgStock, 2), 0) / products.length : 0;
    const stdDev = Math.sqrt(variance);
    const cv = avgStock > 0 ? ((stdDev / avgStock) * 100).toFixed(1) : 0;

    const prompt = `You are a demand forecasting specialist. Analyze forecast accuracy and stock predictability.

STOCK DISTRIBUTION STATISTICS:
- Total Products: ${products.length}
- Total Stock: ${totalStock.toLocaleString()} units
- Average Stock/Product: ${Math.round(avgStock)} units
- Standard Deviation: ${Math.round(stdDev)} units
- Coefficient of Variation: ${cv}% (${cv < 30 ? 'LOW variability - predictable' : cv < 60 ? 'MODERATE variability' : 'HIGH variability - unpredictable'})

STOCK vs REORDER POINT ANALYSIS:
- Products at Optimal Level (stock > reorder point): ${products.filter(p => (p.stock || 0) > (p.reorderPoint || 50)).length}
- Products Below Reorder Point: ${products.filter(p => (p.stock || 0) <= (p.reorderPoint || 50)).length}
- Average Reorder Point: ${products.length > 0 ? Math.round(products.reduce((s, p) => s + (p.reorderPoint || 50), 0) / products.length) : 0}

DEMAND PATTERN:
${products.sort((a, b) => (b.dailySales || 0) - (a.dailySales || 0)).slice(0, 8).map((p, i) =>
      `${i + 1}. ${p.name}: Daily=${p.dailySales || 0}, Weekly=${p.weeklySales || 0}, Stock=${p.stock}, Days of Supply=${p.dailySales > 0 ? Math.floor((p.stock || 0) / p.dailySales) : 'N/A'}`
    ).join('\n')}

Suggest improvements to forecasting: safety stock levels, reorder point adjustments, and lead time optimization.

Return JSON: { "executiveSummary", "keyInsights" (5), "recommendations" (5 with specific adjustments), "alerts", "metrics": {"efficiencyScore", "healthStatus", "riskLevel", "forecastReliability": "percentage", "avgDaysOfSupply": "days"} }`;

    return await this.callGroqAPI(prompt, 'demand forecasting specialist with expertise in statistical inventory management and safety stock optimization');
  }

  async analyzeTurnover(products, transactions) {
    const stockOutTxns = transactions.filter(t => t.transactionType === 'stock-out');
    const totalSales = stockOutTxns.reduce((s, t) => s + (t.quantity || 0), 0);
    const totalStock = products.reduce((s, p) => s + (p.stock || 0), 0);
    const turnoverRate = totalStock > 0 ? (totalSales / totalStock).toFixed(2) : 0;
    const daysOfSupply = totalSales > 0 ? Math.round((totalStock / totalSales) * 30) : 999;

    // Categorize products by turnover
    const fastMovers = products.filter(p => (p.dailySales || 0) > 10);
    const slowMovers = products.filter(p => (p.dailySales || 0) <= 2 && (p.stock || 0) > 0);
    const deadStock = products.filter(p => (p.dailySales || 0) === 0 && (p.stock || 0) > 0);
    const deadStockValue = deadStock.reduce((s, p) => s + ((p.stock || 0) * (p.price || 0)), 0);

    const prompt = `You are an inventory turnover analyst. Analyze turnover efficiency and identify actionable improvements.

TURNOVER METRICS:
- Monthly Turnover Rate: ${turnoverRate}x
- Total Sales (30d): ${totalSales.toLocaleString()} units
- Current Inventory: ${totalStock.toLocaleString()} units
- Average Days of Supply: ${daysOfSupply} days
- Ideal Turnover Target: 2-4x monthly

PRODUCT VELOCITY CLASSIFICATION:
- Fast Movers (>10 units/day): ${fastMovers.length} products
- Normal Movers: ${products.length - fastMovers.length - slowMovers.length - deadStock.length} products
- Slow Movers (<=2 units/day): ${slowMovers.length} products
- Dead Stock (0 sales): ${deadStock.length} products, Rs ${deadStockValue.toLocaleString()} tied up

TOP FAST MOVERS:
${fastMovers.sort((a, b) => (b.dailySales || 0) - (a.dailySales || 0)).slice(0, 5).map((p, i) =>
      `${i + 1}. ${p.name}: ${p.dailySales} units/day, Stock=${p.stock}, Days Left=${p.dailySales > 0 ? Math.floor((p.stock || 0) / p.dailySales) : 'N/A'}`
    ).join('\n')}

DEAD STOCK (consider clearance/liquidation):
${deadStock.sort((a, b) => ((b.stock || 0) * (b.price || 0)) - ((a.stock || 0) * (a.price || 0))).slice(0, 5).map((p, i) =>
      `${i + 1}. ${p.name}: ${p.stock} units, Value=Rs ${((p.stock || 0) * (p.price || 0)).toLocaleString()}, Last Sold: ${p.lastSoldDate ? new Date(p.lastSoldDate).toLocaleDateString('en-IN') : 'Never'}`
    ).join('\n')}

Provide SPECIFIC liquidation, promotion, or transfer strategies for dead/slow stock with estimated capital recovery.

Return JSON: { "executiveSummary", "keyInsights" (5), "recommendations" (5 with Rs impact), "alerts", "metrics": {"efficiencyScore", "healthStatus", "riskLevel", "turnoverRate": "Xx", "deadStockValue": "formatted", "daysOfSupply": "days"} }`;

    return await this.callGroqAPI(prompt, 'inventory turnover analyst specializing in SKU rationalization, dead stock management, and working capital recovery');
  }

  // ═══════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════

  groupByCategory(products) {
    return products.reduce((acc, product) => {
      const cat = product.category || 'Uncategorized';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(product);
      return acc;
    }, {});
  }

  async callGroqAPI(prompt, expertRole) {
    try {
      const enhancedPrompt = `${prompt}

CRITICAL INSTRUCTIONS:
1. Use ACTUAL NUMBERS from the data provided - never make up statistics
2. Every insight must reference specific data points
3. Every recommendation must include a SPECIFIC ACTION with quantities, timelines, or Rs values
4. For problems: state the Problem → Impact → Solution → Expected Outcome
5. Return ONLY a JSON object with these exact fields:
   - executiveSummary: string (3-4 sentences with exact numbers from data)
   - keyInsights: array of strings (NOT objects)
   - recommendations: array of strings (NOT objects) - each must be actionable
   - alerts: array of strings (NOT objects) - only genuine issues
   - metrics: object with string values`;

      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: `You are a ${expertRole}. You provide PRECISE, DATA-DRIVEN analysis using ONLY the actual data provided. Never fabricate numbers. Every recommendation must be ACTIONABLE with specific quantities, timelines, or monetary values. Structure solutions as: Problem → Impact → Action → Expected Outcome.` },
          { role: 'user', content: enhancedPrompt }
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.2,
        max_tokens: 3000,
        response_format: { type: 'json_object' }
      });

      const analysis = JSON.parse(completion.choices[0].message.content);

      return {
        executiveSummary: typeof analysis.executiveSummary === 'string'
          ? analysis.executiveSummary
          : (analysis.executiveSummary?.summary || JSON.stringify(analysis.executiveSummary || 'Analysis completed.')),
        keyInsights: Array.isArray(analysis.keyInsights)
          ? analysis.keyInsights.map(i => typeof i === 'string' ? i : (i.insight || i.text || JSON.stringify(i)))
          : [],
        recommendations: Array.isArray(analysis.recommendations)
          ? analysis.recommendations.map(r => typeof r === 'string' ? r : (r.recommendation || r.text || JSON.stringify(r)))
          : [],
        alerts: Array.isArray(analysis.alerts)
          ? analysis.alerts.map(a => typeof a === 'string' ? a : (a.alert || a.message || JSON.stringify(a)))
          : [],
        metrics: analysis.metrics || {}
      };
    } catch (error) {
      console.error('Groq API Error:', error);
      return {
        executiveSummary: 'AI analysis temporarily unavailable. Please try again.',
        keyInsights: ['Data has been processed but AI insights could not be generated'],
        recommendations: ['Retry report generation for full AI analysis'],
        alerts: [],
        metrics: { efficiencyScore: 'N/A', healthStatus: 'N/A', riskLevel: 'N/A' }
      };
    }
  }
}

module.exports = new AIReportService();
