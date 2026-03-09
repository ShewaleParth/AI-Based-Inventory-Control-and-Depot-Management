const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class PDFGenerator {
  constructor() {
    this.reportsDir = process.env.REPORTS_DIR || path.join(__dirname, '../reports');
    this.ensureReportsDirectory();
    // Color palette
    this.colors = {
      primary: '#4F46E5',
      primaryLight: '#818CF8',
      secondary: '#0891B2',
      success: '#059669',
      warning: '#F59E0B',
      danger: '#DC2626',
      text: '#1F2937',
      textMuted: '#6B7280',
      textLight: '#9CA3AF',
      bg: '#F9FAFB',
      bgCard: '#FFFFFF',
      border: '#E5E7EB',
      borderLight: '#F3F4F6'
    };
  }

  ensureReportsDirectory() {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  UNIVERSAL REPORT GENERATOR
  // ═══════════════════════════════════════════════════════════

  async generateUniversalReport(reportType, data, aiAnalysis) {
    const reportTitles = {
      'inventory-summary': 'Inventory Summary Report',
      'stock-levels': 'Stock Levels Report',
      'low-stock': 'Low Stock Alert Report',
      'stock-movement': 'Stock Movement Report',
      'depot-analysis': 'Depot Analysis Report',
      'capacity-analysis': 'Capacity Analysis Report',
      'depot-comparison': 'Depot Comparison Report',
      'inventory-valuation': 'Inventory Valuation Report',
      'cost-analysis': 'Cost Analysis Report',
      'profit-loss': 'Profit & Loss Report',
      'trend-analysis': 'Trend Analysis Report',
      'forecast-accuracy': 'Forecast Accuracy Report',
      'turnover-rate': 'Turnover Rate Report'
    };

    const filename = `${reportType}-${Date.now()}.pdf`;
    const filepath = path.join(this.reportsDir, filename);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          margin: 50,
          size: 'A4',
          bufferPages: true,
          info: {
            Title: reportTitles[reportType] || 'Report',
            Author: 'Sangrahak - AI Inventory Management',
            Subject: reportTitles[reportType]
          }
        });

        const stream = fs.createWriteStream(filepath);
        doc.pipe(stream);

        // Page 1: Cover
        this.drawCover(doc, reportTitles[reportType] || 'Report', reportType, data);

        // Page 2: Executive Summary + Metrics
        doc.addPage();
        this.drawExecutiveSummary(doc, aiAnalysis, data);

        // Page 3: Visual Charts based on report type
        doc.addPage();
        this.drawCharts(doc, reportType, data, aiAnalysis);

        // Page 4: AI Insights & Recommendations
        doc.addPage();
        this.drawInsightsPage(doc, aiAnalysis);

        // Page 5: Data Table
        if (data.products && data.products.length > 0) {
          doc.addPage();
          this.drawDataTable(doc, reportType, data);
        }

        // Page numbers
        this.addPageNumbers(doc);

        doc.end();

        stream.on('finish', () => {
          const stats = fs.statSync(filepath);
          resolve({ filepath, filename, fileSize: stats.size });
        });
        stream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  PAGE 1: COVER
  // ═══════════════════════════════════════════════════════════

  drawCover(doc, title, reportType, data) {
    const w = doc.page.width;
    const h = doc.page.height;

    // Color based on report category
    const categoryColors = {
      'inventory': '#4F46E5', 'stock': '#0891B2', 'low': '#DC2626',
      'depot': '#0891B2', 'capacity': '#0891B2',
      'valuation': '#059669', 'cost': '#059669', 'profit': '#059669',
      'trend': '#7C3AED', 'forecast': '#7C3AED', 'turnover': '#7C3AED'
    };
    const colorKey = Object.keys(categoryColors).find(k => reportType.includes(k)) || 'inventory';
    const color = categoryColors[colorKey];

    // Top gradient bar
    doc.rect(0, 0, w, 220).fill(color);

    // Brand
    doc.fontSize(12).fillColor('#FFFFFF').font('Helvetica-Bold').text('SANGRAHAK', 50, 40);
    doc.fontSize(10).fillColor('#E0E7FF').font('Helvetica').text('AI-Powered Inventory Intelligence', 50, 56);

    // Title
    doc.fontSize(30).fillColor('#FFFFFF').font('Helvetica-Bold').text(title.toUpperCase(), 50, 100, { width: w - 100 });

    // Date & Time
    doc.fontSize(11).fillColor('#C7D2FE').font('Helvetica')
      .text(`Generated: ${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`, 50, 180);

    // Quick stats boxes
    const { products = [], depots = [], transactions = [] } = data;
    const totalValue = products.reduce((s, p) => s + ((p.stock || 0) * (p.price || 0)), 0);
    const lowCount = products.filter(p => p.status === 'low-stock' || p.status === 'out-of-stock').length;

    const stats = [
      { label: 'Total Products', value: products.length.toString(), color: '#4F46E5' },
      { label: 'Total Depots', value: depots.length.toString(), color: '#0891B2' },
      { label: 'Inventory Value', value: `Rs ${this.formatLargeNumber(totalValue)}`, color: '#059669' },
      { label: 'At Risk Items', value: lowCount.toString(), color: lowCount > 0 ? '#DC2626' : '#059669' }
    ];

    const boxW = (w - 120) / 4;
    stats.forEach((stat, i) => {
      const x = 50 + i * (boxW + 8);
      const y = 270;

      doc.roundedRect(x, y, boxW, 70, 6).fillAndStroke('#FFFFFF', '#E5E7EB');
      doc.fontSize(9).fillColor('#6B7280').font('Helvetica').text(stat.label, x + 12, y + 14, { width: boxW - 24 });
      doc.fontSize(20).fillColor(stat.color).font('Helvetica-Bold').text(stat.value, x + 12, y + 32, { width: boxW - 24 });
    });

    // Report scope
    doc.fontSize(12).fillColor('#1F2937').font('Helvetica-Bold').text('Report Scope', 50, 380);
    doc.fontSize(10).fillColor('#6B7280').font('Helvetica')
      .text(`Report Type: ${title}`, 50, 400)
      .text(`Data Period: Last 30 Days`, 50, 415)
      .text(`Analysis Engine: LLaMA-3.3-70B (Groq)`, 50, 430)
      .text(`Total Data Points Analyzed: ${products.length + depots.length + transactions.length}`, 50, 445);

    // Target info for depot reports
    if (data.depotData) {
      doc.text(`Target Depot: ${data.depotData.name} (${data.depotData.location})`, 50, 460);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  PAGE 2: EXECUTIVE SUMMARY + METRICS
  // ═══════════════════════════════════════════════════════════

  drawExecutiveSummary(doc, aiAnalysis, data) {
    const w = doc.page.width;
    let y = 50;

    // Section title
    doc.fontSize(20).fillColor('#1F2937').font('Helvetica-Bold').text('Executive Summary', 50, y);
    y += 35;

    // Summary box
    const summaryText = aiAnalysis.executiveSummary || 'Analysis completed.';
    const summaryH = Math.max(80, Math.min(130, summaryText.length * 0.5));
    doc.roundedRect(50, y, w - 100, summaryH, 6).fillAndStroke('#F0F4FF', '#C7D2FE');
    doc.fontSize(11).fillColor('#1F2937').font('Helvetica')
      .text(summaryText, 65, y + 15, { width: w - 130, lineGap: 4, align: 'justify' });
    y += summaryH + 20;

    // Performance Metrics
    if (aiAnalysis.metrics) {
      doc.fontSize(16).fillColor('#1F2937').font('Helvetica-Bold').text('Performance Metrics', 50, y);
      y += 28;

      const metrics = Object.entries(aiAnalysis.metrics);
      const colW = (w - 120) / Math.min(metrics.length, 3);

      metrics.slice(0, 6).forEach((entry, i) => {
        const [key, value] = entry;
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = 50 + col * (colW + 10);
        const yPos = y + row * 70;

        doc.roundedRect(x, yPos, colW, 60, 6).fillAndStroke('#FFFFFF', '#E5E7EB');

        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
        doc.fontSize(9).fillColor('#6B7280').font('Helvetica').text(label, x + 12, yPos + 12, { width: colW - 24 });

        const valColor = this.getMetricColor(key, value);
        doc.fontSize(16).fillColor(valColor).font('Helvetica-Bold')
          .text(String(value), x + 12, yPos + 30, { width: colW - 24 });
      });

      y += Math.ceil(metrics.slice(0, 6).length / 3) * 70 + 20;
    }

    // Key Data Summary based on actual data
    const { products = [], depots = [], transactions = [] } = data;
    if (y < 580) {
      doc.fontSize(16).fillColor('#1F2937').font('Helvetica-Bold').text('Data Summary', 50, y);
      y += 28;

      const totalValue = products.reduce((s, p) => s + ((p.stock || 0) * (p.price || 0)), 0);
      const totalStock = products.reduce((s, p) => s + (p.stock || 0), 0);
      const stockIn = transactions.filter(t => t.transactionType === 'stock-in').reduce((s, t) => s + (t.quantity || 0), 0);
      const stockOut = transactions.filter(t => t.transactionType === 'stock-out').reduce((s, t) => s + (t.quantity || 0), 0);

      const summaryData = [
        ['Total Products', products.length.toString()],
        ['Total Units in Stock', totalStock.toLocaleString()],
        ['Total Inventory Value', `Rs ${totalValue.toLocaleString()}`],
        ['In Stock', products.filter(p => p.status === 'in-stock').length.toString()],
        ['Low Stock', products.filter(p => p.status === 'low-stock').length.toString()],
        ['Out of Stock', products.filter(p => p.status === 'out-of-stock').length.toString()],
        ['Active Depots', depots.length.toString()],
        ['Transactions (30d)', transactions.length.toString()],
        ['Stock-In Volume', `${stockIn.toLocaleString()} units`],
        ['Stock-Out Volume', `${stockOut.toLocaleString()} units`]
      ];

      summaryData.forEach((item, i) => {
        const rowY = y + i * 22;
        if (rowY > doc.page.height - 80) return;
        const bgColor = i % 2 === 0 ? '#F9FAFB' : '#FFFFFF';
        doc.rect(50, rowY, w - 100, 20).fill(bgColor);
        doc.fontSize(10).fillColor('#6B7280').font('Helvetica').text(item[0], 60, rowY + 5);
        doc.fontSize(10).fillColor('#1F2937').font('Helvetica-Bold').text(item[1], w - 200, rowY + 5, { width: 140, align: 'right' });
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  PAGE 3: VISUAL CHARTS
  // ═══════════════════════════════════════════════════════════

  drawCharts(doc, reportType, data, aiAnalysis) {
    const w = doc.page.width;
    let y = 50;

    doc.fontSize(20).fillColor('#1F2937').font('Helvetica-Bold').text('Visual Analysis', 50, y);
    y += 40;

    const { products = [], depots = [], transactions = [] } = data;

    // Chart 1: Stock Status Distribution (Horizontal bar chart)
    y = this.drawStockStatusChart(doc, products, 50, y, w - 100, 160);
    y += 25;

    // Chart 2: Based on report type
    if (reportType.includes('depot') || reportType.includes('capacity')) {
      y = this.drawDepotUtilizationChart(doc, depots, data.depotData, 50, y, w - 100, 180);
    } else if (reportType.includes('valuation') || reportType.includes('cost') || reportType.includes('profit')) {
      y = this.drawCategoryValueChart(doc, products, 50, y, w - 100, 200);
    } else if (reportType.includes('movement') || reportType.includes('trend')) {
      y = this.drawTransactionChart(doc, transactions, 50, y, w - 100, 180);
    } else if (reportType.includes('turnover')) {
      y = this.drawTurnoverChart(doc, products, 50, y, w - 100, 180);
    } else {
      y = this.drawCategoryValueChart(doc, products, 50, y, w - 100, 200);
    }

    // Chart 3: Top/Bottom products if space
    if (y < doc.page.height - 250) {
      y += 20;
      y = this.drawTopBottomProducts(doc, products, 50, y, w - 100);
    }
  }

  // ─── Stock Status Bar Chart ───
  drawStockStatusChart(doc, products, x, y, width, height) {
    doc.fontSize(14).fillColor('#1F2937').font('Helvetica-Bold').text('Stock Health Distribution', x, y);
    y += 22;

    const statuses = [
      { label: 'In Stock', count: products.filter(p => p.status === 'in-stock').length, color: '#059669' },
      { label: 'Low Stock', count: products.filter(p => p.status === 'low-stock').length, color: '#F59E0B' },
      { label: 'Out of Stock', count: products.filter(p => p.status === 'out-of-stock').length, color: '#DC2626' },
      { label: 'Overstock', count: products.filter(p => p.status === 'overstock').length, color: '#3B82F6' }
    ];

    const maxCount = Math.max(...statuses.map(s => s.count), 1);
    const barH = 24;
    const gap = 12;

    statuses.forEach((status, i) => {
      const barY = y + i * (barH + gap);
      const barW = Math.max(4, (status.count / maxCount) * (width - 160));

      // Label
      doc.fontSize(10).fillColor('#6B7280').font('Helvetica').text(status.label, x, barY + 6, { width: 90 });

      // Bar background
      doc.roundedRect(x + 95, barY, width - 160, barH, 4).fill('#F3F4F6');

      // Bar fill
      if (barW > 4) {
        doc.roundedRect(x + 95, barY, barW, barH, 4).fill(status.color);
      }

      // Count
      doc.fontSize(11).fillColor('#1F2937').font('Helvetica-Bold')
        .text(`${status.count} (${products.length > 0 ? ((status.count / products.length) * 100).toFixed(0) : 0}%)`,
          x + width - 60, barY + 6, { width: 60, align: 'right' });
    });

    return y + statuses.length * (barH + gap) + 10;
  }

  // ─── Depot Utilization Chart ───
  drawDepotUtilizationChart(doc, depots, focusDepot, x, y, width, height) {
    doc.fontSize(14).fillColor('#1F2937').font('Helvetica-Bold').text('Depot Capacity Utilization', x, y);
    y += 22;

    const depotsToShow = depots.slice(0, 6);
    const barH = 22;
    const gap = 16;

    depotsToShow.forEach((depot, i) => {
      const barY = y + i * (barH + gap);
      const pct = depot.capacity > 0 ? (depot.currentUtilization / depot.capacity) * 100 : 0;
      const barW = Math.max(4, (pct / 100) * (width - 180));
      const barColor = pct >= 90 ? '#DC2626' : pct >= 75 ? '#F59E0B' : '#059669';
      const isFocus = focusDepot && (depot._id?.toString() === focusDepot._id?.toString() || depot.name === focusDepot.name);

      // Depot name
      const nameStyle = isFocus ? 'Helvetica-Bold' : 'Helvetica';
      doc.fontSize(10).fillColor(isFocus ? '#4F46E5' : '#6B7280').font(nameStyle)
        .text(depot.name.substring(0, 18), x, barY + 4, { width: 110 });

      // Bar background
      doc.roundedRect(x + 115, barY, width - 200, barH, 4).fill('#F3F4F6');

      // Bar fill
      doc.roundedRect(x + 115, barY, barW > width - 200 ? width - 200 : barW, barH, 4).fill(barColor);

      // Percentage
      doc.fontSize(10).fillColor('#1F2937').font('Helvetica-Bold')
        .text(`${pct.toFixed(0)}%`, x + width - 80, barY + 5, { width: 35, align: 'right' });

      // Units
      doc.fontSize(8).fillColor('#9CA3AF').font('Helvetica')
        .text(`${depot.currentUtilization}/${depot.capacity}`, x + width - 40, barY + 6, { width: 50 });
    });

    return y + depotsToShow.length * (barH + gap) + 10;
  }

  // ─── Category Value Chart ───
  drawCategoryValueChart(doc, products, x, y, width, height) {
    doc.fontSize(14).fillColor('#1F2937').font('Helvetica-Bold').text('Inventory Value by Category', x, y);
    y += 22;

    const categoryMap = {};
    products.forEach(p => {
      const cat = p.category || 'Uncategorized';
      if (!categoryMap[cat]) categoryMap[cat] = { value: 0, stock: 0, count: 0 };
      categoryMap[cat].value += (p.stock || 0) * (p.price || 0);
      categoryMap[cat].stock += (p.stock || 0);
      categoryMap[cat].count += 1;
    });

    const categories = Object.entries(categoryMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const maxVal = Math.max(...categories.map(c => c.value), 1);
    const barH = 20;
    const gap = 10;
    const colors = ['#4F46E5', '#0891B2', '#059669', '#DC2626', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6'];

    categories.forEach((cat, i) => {
      const barY = y + i * (barH + gap);
      const barW = Math.max(4, (cat.value / maxVal) * (width - 200));

      // Category name
      doc.fontSize(9).fillColor('#6B7280').font('Helvetica')
        .text(cat.name.substring(0, 16), x, barY + 4, { width: 100 });

      // Bar
      doc.roundedRect(x + 105, barY, width - 220, barH, 3).fill('#F3F4F6');
      doc.roundedRect(x + 105, barY, Math.min(barW, width - 220), barH, 3).fill(colors[i % colors.length]);

      // Value
      doc.fontSize(9).fillColor('#1F2937').font('Helvetica-Bold')
        .text(`Rs ${this.formatLargeNumber(cat.value)}`, x + width - 110, barY + 4, { width: 110, align: 'right' });
    });

    return y + categories.length * (barH + gap) + 10;
  }

  // ─── Transaction Activity Chart ───
  drawTransactionChart(doc, transactions, x, y, width, height) {
    doc.fontSize(14).fillColor('#1F2937').font('Helvetica-Bold').text('Transaction Activity (Last 7 Days)', x, y);
    y += 22;

    // Group by day
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date.setHours(0, 0, 0, 0));
      const dayEnd = new Date(date.setHours(23, 59, 59, 999));
      const label = dayStart.toLocaleDateString('en-IN', { weekday: 'short' });

      const dayTxns = transactions.filter(t => {
        const ts = new Date(t.timestamp);
        return ts >= dayStart && ts <= dayEnd;
      });

      days.push({
        label,
        stockIn: dayTxns.filter(t => t.transactionType === 'stock-in').reduce((s, t) => s + (t.quantity || 0), 0),
        stockOut: dayTxns.filter(t => t.transactionType === 'stock-out').reduce((s, t) => s + (t.quantity || 0), 0)
      });
    }

    const maxVal = Math.max(...days.map(d => Math.max(d.stockIn, d.stockOut)), 1);
    const chartH = 120;
    const barGroupW = (width - 20) / 7;
    const barW = Math.min(barGroupW * 0.35, 25);

    // Y-axis
    doc.moveTo(x + 2, y).lineTo(x + 2, y + chartH).stroke('#E5E7EB');

    // Grid lines
    for (let i = 0; i <= 4; i++) {
      const gridY = y + (chartH * i / 4);
      doc.moveTo(x + 2, gridY).lineTo(x + width, gridY).dash(2, { space: 3 }).stroke('#F3F4F6').undash();
      const gridVal = Math.round(maxVal * (4 - i) / 4);
      doc.fontSize(7).fillColor('#9CA3AF').font('Helvetica').text(gridVal.toString(), x - 30, gridY - 4, { width: 28, align: 'right' });
    }

    // Bars
    days.forEach((day, i) => {
      const groupX = x + 10 + i * barGroupW;

      // Stock-In bar
      const inH = maxVal > 0 ? (day.stockIn / maxVal) * chartH : 0;
      if (inH > 0) {
        doc.roundedRect(groupX, y + chartH - inH, barW, inH, 2).fill('#059669');
      }

      // Stock-Out bar
      const outH = maxVal > 0 ? (day.stockOut / maxVal) * chartH : 0;
      if (outH > 0) {
        doc.roundedRect(groupX + barW + 2, y + chartH - outH, barW, outH, 2).fill('#DC2626');
      }

      // Day label
      doc.fontSize(8).fillColor('#6B7280').font('Helvetica')
        .text(day.label, groupX - 2, y + chartH + 6, { width: barGroupW, align: 'left' });
    });

    // Legend
    const legendY = y + chartH + 22;
    doc.roundedRect(x + 10, legendY, 8, 8, 2).fill('#059669');
    doc.fontSize(9).fillColor('#6B7280').font('Helvetica').text('Stock In', x + 22, legendY);
    doc.roundedRect(x + 80, legendY, 8, 8, 2).fill('#DC2626');
    doc.text('Stock Out', x + 92, legendY);

    return legendY + 20;
  }

  // ─── Turnover Chart ───
  drawTurnoverChart(doc, products, x, y, width, height) {
    doc.fontSize(14).fillColor('#1F2937').font('Helvetica-Bold').text('Product Velocity Classification', x, y);
    y += 22;

    const fast = products.filter(p => (p.dailySales || 0) > 10);
    const normal = products.filter(p => (p.dailySales || 0) > 2 && (p.dailySales || 0) <= 10);
    const slow = products.filter(p => (p.dailySales || 0) > 0 && (p.dailySales || 0) <= 2);
    const dead = products.filter(p => (p.dailySales || 0) === 0 && (p.stock || 0) > 0);

    const categories = [
      { label: 'Fast Movers (>10/day)', count: fast.length, value: fast.reduce((s, p) => s + ((p.stock || 0) * (p.price || 0)), 0), color: '#059669' },
      { label: 'Normal (2-10/day)', count: normal.length, value: normal.reduce((s, p) => s + ((p.stock || 0) * (p.price || 0)), 0), color: '#3B82F6' },
      { label: 'Slow Movers (0-2/day)', count: slow.length, value: slow.reduce((s, p) => s + ((p.stock || 0) * (p.price || 0)), 0), color: '#F59E0B' },
      { label: 'Dead Stock (0 sales)', count: dead.length, value: dead.reduce((s, p) => s + ((p.stock || 0) * (p.price || 0)), 0), color: '#DC2626' }
    ];

    const maxCount = Math.max(...categories.map(c => c.count), 1);
    const barH = 28;
    const gap = 14;

    categories.forEach((cat, i) => {
      const barY = y + i * (barH + gap);
      const barW = Math.max(4, (cat.count / maxCount) * (width - 240));

      doc.fontSize(10).fillColor('#6B7280').font('Helvetica').text(cat.label, x, barY + 8, { width: 140 });
      doc.roundedRect(x + 145, barY, width - 260, barH, 4).fill('#F3F4F6');
      doc.roundedRect(x + 145, barY, Math.min(barW, width - 260), barH, 4).fill(cat.color);
      doc.fontSize(10).fillColor('#1F2937').font('Helvetica-Bold')
        .text(`${cat.count} items`, x + width - 110, barY + 2, { width: 110, align: 'right' });
      doc.fontSize(8).fillColor('#9CA3AF').font('Helvetica')
        .text(`Rs ${this.formatLargeNumber(cat.value)}`, x + width - 110, barY + 16, { width: 110, align: 'right' });
    });

    return y + categories.length * (barH + gap) + 10;
  }

  // ─── Top/Bottom Products ───
  drawTopBottomProducts(doc, products, x, y, width) {
    doc.fontSize(14).fillColor('#1F2937').font('Helvetica-Bold').text('Top & Bottom Stock Items', x, y);
    y += 22;

    const sorted = [...products].sort((a, b) => (b.stock || 0) - (a.stock || 0));
    const top5 = sorted.slice(0, 5);
    const bottom5 = sorted.filter(p => (p.stock || 0) >= 0).slice(-5).reverse();

    // Top 5
    doc.fontSize(11).fillColor('#059669').font('Helvetica-Bold').text('Highest Stock', x, y);
    y += 16;

    top5.forEach((p, i) => {
      if (y > doc.page.height - 60) return;
      const bgColor = i % 2 === 0 ? '#F0FDF4' : '#FFFFFF';
      doc.rect(x, y, width, 18).fill(bgColor);
      doc.fontSize(9).fillColor('#1F2937').font('Helvetica')
        .text(`${i + 1}. ${(p.name || 'Unknown').substring(0, 30)}`, x + 5, y + 4, { width: width * 0.5 });
      doc.text(`${p.stock || 0} units`, x + width * 0.55, y + 4, { width: 80 });
      doc.fillColor('#059669').text(`Rs ${((p.stock || 0) * (p.price || 0)).toLocaleString()}`, x + width * 0.75, y + 4, { width: width * 0.25, align: 'right' });
      y += 18;
    });

    y += 12;

    // Bottom 5
    if (y < doc.page.height - 120) {
      doc.fontSize(11).fillColor('#DC2626').font('Helvetica-Bold').text('Lowest Stock (Needs Attention)', x, y);
      y += 16;

      bottom5.forEach((p, i) => {
        if (y > doc.page.height - 60) return;
        const bgColor = i % 2 === 0 ? '#FEF2F2' : '#FFFFFF';
        doc.rect(x, y, width, 18).fill(bgColor);
        doc.fontSize(9).fillColor('#1F2937').font('Helvetica')
          .text(`${i + 1}. ${(p.name || 'Unknown').substring(0, 30)}`, x + 5, y + 4, { width: width * 0.5 });
        doc.fillColor(p.stock === 0 ? '#DC2626' : '#F59E0B').font('Helvetica-Bold')
          .text(`${p.stock || 0} units`, x + width * 0.55, y + 4, { width: 80 });
        doc.fillColor('#6B7280').font('Helvetica')
          .text(`Reorder: ${p.reorderPoint || 'N/A'}`, x + width * 0.75, y + 4, { width: width * 0.25, align: 'right' });
        y += 18;
      });
    }

    return y;
  }

  // ═══════════════════════════════════════════════════════════
  //  PAGE 4: AI INSIGHTS & RECOMMENDATIONS
  // ═══════════════════════════════════════════════════════════

  drawInsightsPage(doc, aiAnalysis) {
    const w = doc.page.width;
    let y = 50;

    // Key Insights
    doc.fontSize(20).fillColor('#1F2937').font('Helvetica-Bold').text('AI-Generated Insights', 50, y);
    y += 35;

    doc.fontSize(14).fillColor('#4F46E5').font('Helvetica-Bold').text('Key Insights', 50, y);
    y += 22;

    const insights = aiAnalysis.keyInsights || [];
    insights.forEach((insight, idx) => {
      if (y > doc.page.height - 100) { doc.addPage(); y = 50; }

      // Numbered circle
      doc.circle(62, y + 7, 10).fill('#EEF2FF');
      doc.fontSize(9).fillColor('#4F46E5').font('Helvetica-Bold').text(`${idx + 1}`, 57, y + 3);

      // Insight text
      doc.fontSize(10).fillColor('#374151').font('Helvetica')
        .text(insight, 80, y, { width: w - 130, lineGap: 3 });

      y = doc.y + 12;
    });

    y += 15;

    // Recommendations
    if (y > doc.page.height - 150) { doc.addPage(); y = 50; }
    doc.fontSize(14).fillColor('#059669').font('Helvetica-Bold').text('Actionable Recommendations', 50, y);
    y += 22;

    const recommendations = aiAnalysis.recommendations || [];
    recommendations.forEach((rec, idx) => {
      if (y > doc.page.height - 100) { doc.addPage(); y = 50; }

      // Green marker
      doc.roundedRect(50, y, 4, 14, 2).fill('#059669');

      doc.fontSize(10).fillColor('#059669').font('Helvetica-Bold').text(`Action ${idx + 1}:`, 62, y);
      y += 15;

      doc.fontSize(10).fillColor('#374151').font('Helvetica')
        .text(rec, 62, y, { width: w - 112, lineGap: 3 });

      y = doc.y + 12;
    });

    // Alerts Section
    const alerts = aiAnalysis.alerts || [];
    if (alerts.length > 0 && alerts[0] !== 'None' && y < doc.page.height - 100) {
      y += 10;
      doc.fontSize(14).fillColor('#DC2626').font('Helvetica-Bold').text('Critical Alerts', 50, y);
      y += 22;

      alerts.forEach((alert, idx) => {
        if (y > doc.page.height - 80) { doc.addPage(); y = 50; }

        const alertH = Math.max(35, Math.min(55, alert.length * 0.35));
        doc.roundedRect(50, y, w - 100, alertH, 5).fillAndStroke('#FEF2F2', '#FECACA');
        doc.fontSize(10).fillColor('#991B1B').font('Helvetica')
          .text(`${idx + 1}. ${alert}`, 65, y + 10, { width: w - 130 });
        y += alertH + 8;
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  PAGE 5: DATA TABLE
  // ═══════════════════════════════════════════════════════════

  drawDataTable(doc, reportType, data) {
    const w = doc.page.width;
    let y = 50;

    doc.fontSize(20).fillColor('#1F2937').font('Helvetica-Bold').text('Detailed Data', 50, y);
    y += 35;

    const products = data.products || [];

    // Determine columns based on report type
    let headers, colWidths, getRowData;

    if (reportType.includes('low-stock')) {
      headers = ['Product', 'SKU', 'Stock', 'Reorder Pt', 'Days Left', 'Supplier'];
      colWidths = [140, 80, 55, 65, 60, 100];
      getRowData = (p) => [
        (p.name || 'Unknown').substring(0, 22),
        p.sku || 'N/A',
        (p.stock || 0).toString(),
        (p.reorderPoint || 50).toString(),
        p.dailySales > 0 ? Math.floor((p.stock || 0) / p.dailySales).toString() : 'N/A',
        (p.supplier || 'N/A').substring(0, 15)
      ];
    } else if (reportType.includes('valuation') || reportType.includes('cost') || reportType.includes('profit')) {
      headers = ['Product', 'SKU', 'Stock', 'Price', 'Total Value', 'Status'];
      colWidths = [140, 80, 55, 70, 90, 65];
      getRowData = (p) => [
        (p.name || 'Unknown').substring(0, 22),
        p.sku || 'N/A',
        (p.stock || 0).toString(),
        `Rs ${(p.price || 0).toLocaleString()}`,
        `Rs ${((p.stock || 0) * (p.price || 0)).toLocaleString()}`,
        p.status || 'N/A'
      ];
    } else if (reportType.includes('turnover')) {
      headers = ['Product', 'SKU', 'Stock', 'Daily Sales', 'Days Supply', 'Velocity'];
      colWidths = [140, 80, 55, 70, 70, 85];
      getRowData = (p) => [
        (p.name || 'Unknown').substring(0, 22),
        p.sku || 'N/A',
        (p.stock || 0).toString(),
        (p.dailySales || 0).toString(),
        p.dailySales > 0 ? Math.floor((p.stock || 0) / p.dailySales).toString() : 'N/A',
        (p.dailySales || 0) > 10 ? 'Fast' : (p.dailySales || 0) > 2 ? 'Normal' : (p.dailySales || 0) > 0 ? 'Slow' : 'Dead'
      ];
    } else {
      headers = ['Product', 'SKU', 'Stock', 'Category', 'Value', 'Status'];
      colWidths = [140, 80, 55, 80, 80, 65];
      getRowData = (p) => [
        (p.name || 'Unknown').substring(0, 22),
        p.sku || 'N/A',
        (p.stock || 0).toString(),
        (p.category || 'N/A').substring(0, 12),
        `Rs ${((p.stock || 0) * (p.price || 0)).toLocaleString()}`,
        p.status || 'N/A'
      ];
    }

    // Table Header
    let x = 50;
    headers.forEach((header, i) => {
      doc.rect(x, y, colWidths[i], 28).fill('#4F46E5');
      doc.fontSize(9).fillColor('#FFFFFF').font('Helvetica-Bold')
        .text(header, x + 6, y + 9, { width: colWidths[i] - 12 });
      x += colWidths[i];
    });
    y += 28;

    // Sort products for relevance
    let sortedProducts;
    if (reportType.includes('low-stock')) {
      sortedProducts = [...products].sort((a, b) => (a.stock || 0) - (b.stock || 0));
    } else if (reportType.includes('valuation') || reportType.includes('profit')) {
      sortedProducts = [...products].sort((a, b) => ((b.stock || 0) * (b.price || 0)) - ((a.stock || 0) * (a.price || 0)));
    } else if (reportType.includes('turnover')) {
      sortedProducts = [...products].sort((a, b) => (b.dailySales || 0) - (a.dailySales || 0));
    } else {
      sortedProducts = [...products].sort((a, b) => (b.stock || 0) - (a.stock || 0));
    }

    // Table Rows
    sortedProducts.slice(0, 25).forEach((product, idx) => {
      if (y > doc.page.height - 60) {
        doc.addPage();
        y = 50;
        // Redraw header
        x = 50;
        headers.forEach((header, i) => {
          doc.rect(x, y, colWidths[i], 28).fill('#4F46E5');
          doc.fontSize(9).fillColor('#FFFFFF').font('Helvetica-Bold')
            .text(header, x + 6, y + 9, { width: colWidths[i] - 12 });
          x += colWidths[i];
        });
        y += 28;
      }

      x = 50;
      const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
      const rowData = getRowData(product);

      rowData.forEach((cell, i) => {
        doc.rect(x, y, colWidths[i], 24).fill(rowBg);

        let textColor = '#374151';
        // Color-code status column
        if (headers[i] === 'Status' || headers[i] === 'Velocity') {
          if (cell === 'out-of-stock' || cell === 'Dead') textColor = '#DC2626';
          else if (cell === 'low-stock' || cell === 'Slow') textColor = '#F59E0B';
          else if (cell === 'in-stock' || cell === 'Fast') textColor = '#059669';
          else if (cell === 'overstock' || cell === 'Normal') textColor = '#3B82F6';
        }
        // Color-code stock column
        if (headers[i] === 'Stock' && parseInt(cell) === 0) textColor = '#DC2626';

        doc.fontSize(8).fillColor(textColor).font(headers[i] === 'Status' || headers[i] === 'Velocity' ? 'Helvetica-Bold' : 'Helvetica')
          .text(cell, x + 6, y + 7, { width: colWidths[i] - 12 });
        x += colWidths[i];
      });
      y += 24;
    });

    // Row count footer
    y += 10;
    doc.fontSize(9).fillColor('#9CA3AF').font('Helvetica')
      .text(`Showing ${Math.min(sortedProducts.length, 25)} of ${sortedProducts.length} products (sorted by relevance)`, 50, y);
  }

  // ═══════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════

  addPageNumbers(doc) {
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor('#9CA3AF').font('Helvetica')
        .text(
          `Page ${i + 1} of ${pages.count}  |  Sangrahak AI Inventory Intelligence  |  ${new Date().toLocaleDateString('en-IN')}`,
          50, doc.page.height - 35,
          { align: 'center', width: doc.page.width - 100 }
        );
    }
  }

  formatLargeNumber(num) {
    if (!num && num !== 0) return '0';
    if (num >= 10000000) return `${(num / 10000000).toFixed(1)}Cr`;
    if (num >= 100000) return `${(num / 100000).toFixed(1)}L`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString('en-IN');
  }

  getMetricColor(key, value) {
    const valStr = String(value).toLowerCase();
    if (valStr.includes('excellent') || valStr.includes('low') && key.toLowerCase().includes('risk')) return '#059669';
    if (valStr.includes('good')) return '#059669';
    if (valStr.includes('fair') || valStr.includes('medium') || valStr.includes('moderate')) return '#F59E0B';
    if (valStr.includes('poor') || valStr.includes('high') && key.toLowerCase().includes('risk')) return '#DC2626';

    const numVal = parseInt(valStr);
    if (!isNaN(numVal)) {
      if (numVal >= 80) return '#059669';
      if (numVal >= 60) return '#F59E0B';
      if (numVal < 60) return '#DC2626';
    }

    return '#4F46E5';
  }

  getRiskColor(riskLevel) {
    const colors = { 'Low': '#059669', 'Medium': '#F59E0B', 'High': '#DC2626' };
    return colors[riskLevel] || '#6B7280';
  }
}

module.exports = new PDFGenerator();
