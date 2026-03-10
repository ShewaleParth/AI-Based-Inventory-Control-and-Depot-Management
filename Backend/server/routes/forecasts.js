const express = require('express');
const router = express.Router();
const Forecast = require('../models/Forecast');
const { asyncWrap } = require('../middleware/errorHandler');
const { enqueueForecast, getJobStatus } = require('../services/forecastService');

// POST /enqueue -> Queue async ML forecast job
router.post('/enqueue', asyncWrap(async (req, res) => {
  const { productId, days = 30 } = req.body;
  const userId = req.organizationId;

  if (!productId) {
    return res.status(400).json({ message: 'productId is required' });
  }

  const result = await enqueueForecast(productId, userId, days);

  if (result.cached) {
    return res.json({ source: 'cache', data: result.data });
  }

  res.status(202).json({ jobId: result.jobId, status: 'queued' });
}));

// GET /status/:jobId -> Poll status
router.get('/status/:jobId', asyncWrap(async (req, res) => {
  const status = await getJobStatus(req.params.jobId);
  res.json(status);
}));

// GET all forecasts
router.get('/', async (req, res, next) => {
  try {
    const { sku, limit = 10000, sortBy = 'updatedAt' } = req.query;
    const userId = req.organizationId; // From JWT token

    const query = { userId };

    if (sku) {
      query.sku = sku;
    }

    const forecasts = await Forecast.find(query)
      .sort({ [sortBy]: -1 })
      .limit(Math.min(parseInt(limit), 100));

    res.json({
      forecasts: forecasts.map(forecast => ({
        id: forecast._id,
        itemId: forecast.itemId,
        productName: forecast.productName,
        sku: forecast.sku,
        currentStock: forecast.currentStock,
        stockStatusPred: forecast.stockStatusPred,
        priorityPred: forecast.priorityPred,
        alert: forecast.alert,
        aiInsights: forecast.aiInsights,
        forecastData: forecast.forecastData,
        inputParams: forecast.inputParams,
        updatedAt: forecast.updatedAt
      })),
      total: forecasts.length
    });
  } catch (error) {
    next(error);
  }
});

// GET forecast by SKU or Item ID
router.get('/:identifier', async (req, res, next) => {
  try {
    const { identifier } = req.params;
    const userId = req.organizationId;

    let forecast = await Forecast.findOne({ sku: identifier, userId });
    if (!forecast) {
      forecast = await Forecast.findOne({ itemId: identifier, userId });
    }

    if (!forecast) {
      return res.status(404).json({ message: 'Forecast not found' });
    }

    res.json({
      id: forecast._id,
      itemId: forecast.itemId,
      productName: forecast.productName,
      sku: forecast.sku,
      currentStock: forecast.currentStock,
      stockStatusPred: forecast.stockStatusPred,
      priorityPred: forecast.priorityPred,
      alert: forecast.alert,
      aiInsights: forecast.aiInsights,
      forecastData: forecast.forecastData,
      inputParams: forecast.inputParams,
      updatedAt: forecast.updatedAt
    });
  } catch (error) {
    next(error);
  }
});

// POST - Create or update forecast
router.post('/', async (req, res, next) => {
  try {
    const { itemId, sku } = req.body;
    const userId = req.organizationId;

    let forecast = await Forecast.findOne({ $or: [{ itemId }, { sku }], userId });

    if (forecast) {
      Object.assign(forecast, req.body);
      forecast.updatedAt = new Date();
      await forecast.save();
    } else {
      forecast = new Forecast(req.body);
      await forecast.save();
    }

    res.status(201).json({
      message: 'Forecast saved successfully',
      forecast: {
        id: forecast._id,
        itemId: forecast.itemId,
        productName: forecast.productName,
        sku: forecast.sku,
        currentStock: forecast.currentStock,
        stockStatusPred: forecast.stockStatusPred,
        priorityPred: forecast.priorityPred,
        alert: forecast.alert,
        forecastData: forecast.forecastData,
        inputParams: forecast.inputParams
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET forecast analytics
router.get('/analytics/insights', async (req, res, next) => {
  try {
    const userId = req.organizationId;

    const forecasts = await Forecast.find({ userId });

    const highPriorityCount = forecasts.filter(f =>
      f.priorityPred === 'High' || f.priorityPred === 'Very High'
    ).length;

    const understockCount = forecasts.filter(f =>
      f.stockStatusPred === 'Understock'
    ).length;

    const avgStockLevel = forecasts.length > 0
      ? forecasts.reduce((sum, f) => sum + f.currentStock, 0) / forecasts.length
      : 0;

    const topReorders = forecasts
      .filter(f => f.priorityPred === 'High' || f.priorityPred === 'Very High')
      .sort((a, b) => {
        const priorityOrder = { 'Very High': 3, 'High': 2, 'Medium': 1, 'Low': 0 };
        return (priorityOrder[b.priorityPred] || 0) - (priorityOrder[a.priorityPred] || 0);
      })
      .slice(0, 5)
      .map(f => ({
        sku: f.sku,
        name: f.productName,
        currentStock: f.currentStock,
        priority: f.priorityPred,
        predictedDemand: f.forecastData.length > 0
          ? Math.round(f.forecastData.reduce((sum, d) => sum + d.predicted, 0))
          : 0
      }));

    res.json({
      insights: {
        highPriorityCount,
        understockCount,
        avgStockLevel: Math.round(avgStockLevel),
        totalForecasts: forecasts.length
      },
      topReorders,
      alerts: forecasts
        .filter(f => f.alert !== 'Stock OK')
        .map(f => ({
          sku: f.sku,
          productName: f.productName,
          alert: f.alert,
          priority: f.priorityPred
        }))
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
