const { Queue, Worker, QueueEvents } = require('bullmq');
const { callML } = require('./mlClient');
const redis = require('../config/bullmqRedis');
const logger = require('../config/logger');
const Product = require('../models/Product');

const ML_BASE = process.env.ML_URL || `http://localhost:5001`;

// ── Queue: accepts new forecast jobs ─────────────────
const forecastQueue = new Queue('forecast', {
    connection: redis,
    defaultJobOptions: {
        attempts: 3,    // retry failed jobs 3 times
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,  // keep last 100 completed jobs
        removeOnFail: 200,      // keep last 200 failed jobs
    },
});

forecastQueue.on('error', err => logger.warn(`Forecast Queue error: ${err.message}`));

// ── Worker: processes jobs from the queue ─────────────
const forecastWorker = new Worker('forecast', async job => {
    const { productId, days, userId } = job.data;
    logger.info(`Processing forecast: ${productId}, ${days} days`);

    await job.updateProgress(10);

    // Fetch product from DB using Mongoose natively
    const product = await Product.findOne({ _id: productId, userId });
    if (!product) {
        throw new Error('Product not found for ML processing');
    }

    const mlPayload = {
        userId: userId.toString(),
        sku: product.sku,
        productName: product.name,
        currentStock: product.stock,
        dailySales: product.dailySales,
        weeklySales: product.weeklySales,
        reorderLevel: product.reorderPoint,
        leadTime: product.leadTime,
        brand: product.brand,
        category: product.category,
        supplierName: product.supplier,
        forecastDays: days
    };

    const result = await callML('/api/ml/predict/custom', mlPayload);

    await job.updateProgress(80);
    // Cache the result in Redis (1 hour TTL)
    await redis.set(
        `forecast:${productId}:all`,
        JSON.stringify(result),
        'EX', 3600
    );

    await job.updateProgress(100);
    return result;  // stored as job returnvalue
}, {
    connection: redis,
    concurrency: 3,  // process up to 3 forecasts at once
});

forecastWorker.on('completed', (job) => logger.info(`Forecast complete: job ${job.id}`));
forecastWorker.on('failed', (job, err) => logger.error(`Forecast failed: job ${job?.id} — ${err.message}`));

// ── Public API ────────────────────────────────────────
async function enqueueForecast(productId, userId, days = 30) {
    try {
        let cached = null;
        if (redis.status === 'ready') {
            const cacheKey = `forecast:${productId}:all`;
            cached = await redis.get(cacheKey);
        }

        if (cached) {
            return { jobId: null, cached: true, data: JSON.parse(cached) };
        }

        if (redis.status !== 'ready') {
            logger.warn('Redis disconnected, skipping BullMQ. Falling back to synchronous ML processing.');
            return await runForecastSync(productId, userId, days);
        }

        // Queue a new job and return the jobId immediately
        const job = await forecastQueue.add('predict', { productId, days, userId });
        return { jobId: job.id, cached: false };
    } catch (err) {
        logger.error(`Queue error, falling back to sync API: ${err.message}`);
        return await runForecastSync(productId, userId, days);
    }
}

async function runForecastSync(productId, userId, days) {
    const Product = require('../models/Product');
    const product = await Product.findOne({ _id: productId, userId });
    if (!product) throw new Error('Product not found for ML processing');

    const mlPayload = {
        userId: userId.toString(), sku: product.sku, productName: product.name,
        currentStock: product.stock, dailySales: product.dailySales, weeklySales: product.weeklySales,
        reorderLevel: product.reorderPoint, leadTime: product.leadTime, brand: product.brand,
        category: product.category, supplierName: product.supplier, forecastDays: days
    };

    const result = await callML('/api/ml/predict/custom', mlPayload);
    return { jobId: null, cached: true, data: result, source: 'syncFallback' };
}

async function getJobStatus(jobId) {
    const job = await forecastQueue.getJob(jobId);
    if (!job) return { status: 'not_found' };

    const state = await job.getState(); // waiting/active/completed/failed
    return {
        status: state,
        progress: job.progress,
        result: state === 'completed' ? job.returnvalue : null,
        error: state === 'failed' ? job.failedReason : null,
    };
}

module.exports = { enqueueForecast, getJobStatus };
