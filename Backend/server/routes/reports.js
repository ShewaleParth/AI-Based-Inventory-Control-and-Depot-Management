const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Report = require('../models/Report');
const Depot = require('../models/Depot');
const Product = require('../models/Product');
const Transaction = require('../models/Transaction');
const aiReportService = require('../services/aiReportService');
const pdfGenerator = require('../services/pdfGenerator');
const dataExporter = require('../services/dataExporter');
const { cache } = require('../config/redis');
const authenticateToken = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const path = require('path');

// Report type configuration
const REPORT_CONFIG = {
  'inventory-summary': { needsDepot: false, aiMethod: 'analyzeInventorySummary', pdfMethod: 'generateInventorySummary' },
  'stock-levels': { needsDepot: false, aiMethod: 'analyzeStockLevels', pdfMethod: 'generateStockLevels' },
  'low-stock': { needsDepot: false, aiMethod: 'analyzeLowStock', pdfMethod: 'generateLowStock' },
  'stock-movement': { needsDepot: false, aiMethod: 'analyzeStockMovement', pdfMethod: 'generateStockMovement' },
  'depot-analysis': { needsDepot: true, aiMethod: 'analyzeDepotData', pdfMethod: 'generateDepotReport' },
  'capacity-analysis': { needsDepot: false, aiMethod: 'analyzeCapacity', pdfMethod: 'generateCapacityAnalysis' },
  'depot-comparison': { needsDepot: false, aiMethod: 'compareDepots', pdfMethod: 'generateDepotComparison' },
  'inventory-valuation': { needsDepot: false, aiMethod: 'analyzeValuation', pdfMethod: 'generateValuation' },
  'cost-analysis': { needsDepot: false, aiMethod: 'analyzeCosts', pdfMethod: 'generateCostAnalysis' },
  'profit-loss': { needsDepot: false, aiMethod: 'analyzeProfitLoss', pdfMethod: 'generateProfitLoss' },
  'trend-analysis': { needsDepot: false, aiMethod: 'analyzeTrendData', pdfMethod: 'generateTrendAnalysis' },
  'forecast-accuracy': { needsDepot: false, aiMethod: 'analyzeForecastAccuracy', pdfMethod: 'generateForecastAccuracy' },
  'turnover-rate': { needsDepot: false, aiMethod: 'analyzeTurnover', pdfMethod: 'generateTurnoverRate' }
};

/**
 * GET /api/reports/stats
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const cacheKey = `report-stats:${req.organizationId}`;
    const cached = await cache.get(cacheKey);

    if (cached) {
      return res.json(cached);
    }

    const totalReports = await Report.countDocuments({ userId: req.organizationId });
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const todayReports = await Report.countDocuments({
      userId: req.organizationId,
      createdAt: { $gte: todayStart }
    });

    const reports = await Report.find({ userId: req.organizationId, status: 'completed' });
    const totalSize = reports.reduce((sum, r) => sum + (r.fileSize || 0), 0);
    const sizeInMB = (totalSize / (1024 * 1024)).toFixed(1);

    const stats = {
      totalReports,
      generatedToday: todayReports,
      scheduledReports: 24,
      storageUsed: `${sizeInMB} MB`
    };

    await cache.set(cacheKey, stats, 300);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching report stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/reports/list
 */
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const { category, status } = req.query;

    const query = { userId: req.organizationId };
    if (status) query.status = status;

    const reports = await Report.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .select('-data.raw');

    res.json(reports);
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/reports/generate — MANAGER + ADMIN only
 */
router.post('/generate', authenticateToken, requirePermission('reports:export'), async (req, res) => {
  try {
    const { reportType, targetId, format = 'pdf', dateRange } = req.body;

    // Validate report type
    if (!REPORT_CONFIG[reportType]) {
      return res.status(400).json({ error: 'Invalid report type' });
    }

    const config = REPORT_CONFIG[reportType];
    let targetName = 'System Wide';
    let targetModel = 'User';

    // If depot-specific report, validate depot
    if (config.needsDepot && targetId) {
      // Validate that targetId is a valid MongoDB ObjectId
      const mongoose = require('mongoose');
      if (!mongoose.Types.ObjectId.isValid(targetId)) {
        return res.status(400).json({
          error: 'Invalid depot ID format. Please select a valid depot from the dropdown.'
        });
      }

      const depot = await Depot.findOne({ _id: targetId, userId: req.organizationId });
      if (!depot) {
        return res.status(404).json({ error: 'Depot not found' });
      }
      targetName = depot.name;
      targetModel = 'Depot';
    }

    // Create report record
    const report = await Report.create({
      userId: req.organizationId,
      reportType,
      targetId: targetId || null,
      targetModel,
      targetName,
      title: `${reportType.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} - ${targetName}`,
      format,
      dateRange: dateRange || {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: new Date()
      },
      status: 'processing',
      progress: 10
    });

    // Process report asynchronously
    processReportSync(report._id.toString(), req.userId, reportType, targetId, config, format).catch(err => {
      console.error('Background report processing error:', err);
    });

    await cache.del(`report-stats:${req.organizationId}`);

    res.json({
      reportId: report._id,
      status: 'processing',
      message: 'Report generation started. AI is analyzing your data...'
    });
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Universal report processor
 */
async function processReportSync(reportId, userId, reportType, targetId, config, format = 'pdf') {
  try {
    console.log(` Processing ${reportType} report: ${reportId}`);

    // Fetch all necessary data
    const products = await Product.find({ userId }).lean();
    const depots = await Depot.find({ userId }).lean();
    const transactions = await Transaction.find({
      userId,
      timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }).sort({ timestamp: -1 }).lean();

    await Report.findByIdAndUpdate(reportId, { progress: 30 });

    // Get depot-specific data if needed
    let depotData = null;
    if (config.needsDepot && targetId) {
      depotData = await Depot.findOne({ _id: targetId, userId }).lean();
      if (!depotData) throw new Error('Depot not found');
    }

    console.log(` Generating AI analysis for ${reportType}...`);

    // Data for export mapping
    let dataToExport = products;

    // Call appropriate AI analysis method
    let aiAnalysis;
    switch (reportType) {
      case 'depot-analysis':
        const filteredProducts = products.filter(p =>
          p.depotId?.toString() === targetId ||
          p.depotDistribution?.some(d => d.depotId?.toString() === targetId)
        ).map(p => {
          if (p.depotDistribution && p.depotDistribution.length > 0) {
            const dist = p.depotDistribution.find(d => d.depotId?.toString() === targetId);
            if (dist) return { ...p, stock: dist.quantity };
          }
          return p;
        });
        const depotTrans = transactions.filter(t =>
          t.fromDepotId?.toString() === targetId ||
          t.toDepotId?.toString() === targetId ||
          t.fromDepot === targetId ||
          t.toDepot === targetId
        );
        dataToExport = filteredProducts;
        aiAnalysis = await aiReportService.analyzeDepotData(depotData, depotTrans, filteredProducts);
        break;
      case 'inventory-summary':
        aiAnalysis = await aiReportService.analyzeInventorySummary(products, depots, transactions);
        break;
      case 'stock-levels':
        aiAnalysis = await aiReportService.analyzeStockLevels(products, depots);
        break;
      case 'low-stock':
        const lowStockProducts = products.filter(p => p.stock < (p.reorderPoint || 50));
        aiAnalysis = await aiReportService.analyzeLowStock(lowStockProducts);
        break;
      case 'stock-movement':
        aiAnalysis = await aiReportService.analyzeStockMovement(transactions, products);
        break;
      case 'capacity-analysis':
        aiAnalysis = await aiReportService.analyzeCapacity(depots, products);
        break;
      case 'depot-comparison':
        aiAnalysis = await aiReportService.compareDepots(depots, products, transactions);
        break;
      case 'inventory-valuation':
        aiAnalysis = await aiReportService.analyzeValuation(products, depots);
        break;
      case 'cost-analysis':
        aiAnalysis = await aiReportService.analyzeCosts(products, transactions, depots);
        break;
      case 'profit-loss':
        aiAnalysis = await aiReportService.analyzeProfitLoss(products, transactions);
        break;
      case 'trend-analysis':
        aiAnalysis = await aiReportService.analyzeTrendData(transactions, products);
        break;
      case 'forecast-accuracy':
        aiAnalysis = await aiReportService.analyzeForecastAccuracy(products);
        break;
      case 'turnover-rate':
        aiAnalysis = await aiReportService.analyzeTurnover(products, transactions);
        break;
      default:
        throw new Error(`Unsupported report type: ${reportType}`);
    }

    await Report.findByIdAndUpdate(reportId, { progress: 70 });

    console.log(` Generating ${format.toUpperCase()} for ${reportType}...`);

    // Generate output based on format
    let result;
    if (format === 'csv') {
      result = await dataExporter.exportToCSV(reportType, { products: dataToExport });
    } else if (format === 'excel') {
      result = await dataExporter.exportToExcel(reportType, { products: dataToExport });
    } else {
      // Default to PDF
      result = await pdfGenerator.generateUniversalReport(
        reportType,
        { products, depots, transactions, depotData, targetId },
        aiAnalysis
      );
    }

    // Ensure all AI response fields are properly formatted as strings
    // Groq sometimes returns objects instead of strings

    const executive = typeof aiAnalysis.executiveSummary === 'string'
      ? aiAnalysis.executiveSummary
      : (aiAnalysis.executiveSummary?.summary || JSON.stringify(aiAnalysis.executiveSummary || 'Analysis completed'));

    const keyInsights = Array.isArray(aiAnalysis.keyInsights)
      ? aiAnalysis.keyInsights.map(insight =>
        typeof insight === 'string' ? insight : (insight.insight || insight.text || JSON.stringify(insight))
      )
      : [];

    const recommendations = Array.isArray(aiAnalysis.recommendations)
      ? aiAnalysis.recommendations.map(rec =>
        typeof rec === 'string' ? rec : (rec.recommendation || rec.text || JSON.stringify(rec))
      )
      : [];

    const alerts = Array.isArray(aiAnalysis.alerts)
      ? aiAnalysis.alerts.map(alert =>
        typeof alert === 'string' ? alert : (alert.alert || alert.message || JSON.stringify(alert))
      )
      : [];

    // Update report with results
    await Report.findByIdAndUpdate(reportId, {
      status: 'completed',
      aiSummary: {
        executive: executive,
        keyInsights: keyInsights,
        recommendations: recommendations,
        alerts: alerts,
        metrics: aiAnalysis.metrics || {}
      },
      fileUrl: result.filepath,
      fileName: result.filename,
      fileSize: result.fileSize,
      generatedAt: new Date(),
      progress: 100
    });

    console.log(` Report completed: ${reportId}`);
  } catch (error) {
    console.error(` Report generation failed:`, error);
    await Report.findByIdAndUpdate(reportId, {
      status: 'failed',
      error: error.message,
      progress: 0
    });
  }
}

/**
 * GET /api/reports/:reportId/status
 */
router.get('/:reportId/status', authenticateToken, async (req, res) => {
  try {
    const report = await Report.findOne({
      _id: req.params.reportId,
      userId: req.organizationId
    }).select('-data');

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({
      reportId: report._id,
      status: report.status,
      progress: report.progress,
      aiSummary: report.aiSummary,
      generatedAt: report.generatedAt,
      error: report.error,
      fileName: report.fileName
    });
  } catch (error) {
    console.error('Error fetching report status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/reports/:reportId/download
 */
router.get('/:reportId/download', authenticateToken, async (req, res) => {
  try {
    const report = await Report.findOne({
      _id: req.params.reportId,
      userId: req.organizationId
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    if (report.status !== 'completed') {
      return res.status(400).json({
        error: 'Report not ready',
        status: report.status,
        progress: report.progress
      });
    }

    if (!report.fileUrl) {
      return res.status(404).json({ error: 'Report file not found' });
    }

    res.download(report.fileUrl, report.fileName || 'report.pdf', (err) => {
      if (err) {
        console.error('Download error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to download report' });
        }
      }
    });
  } catch (error) {
    console.error('Error downloading report:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/reports/:reportId
 */
router.delete('/:reportId', authenticateToken, async (req, res) => {
  try {
    const report = await Report.findOneAndDelete({
      _id: req.params.reportId,
      userId: req.organizationId
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Delete file if exists
    if (report.fileUrl) {
      const fs = require('fs');
      if (fs.existsSync(report.fileUrl)) {
        fs.unlinkSync(report.fileUrl);
      }
    }

    await cache.del(`report-stats:${req.organizationId}`);

    res.json({ message: 'Report deleted successfully' });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
