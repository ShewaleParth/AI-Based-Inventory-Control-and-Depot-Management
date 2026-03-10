const axios = require('axios');
const redis = require('../config/bullmqRedis'); // Using the robust ioredis instance
const logger = require('../config/logger');

// Circuit breaker state (in-memory — resets on restart)
// For multi-instance production use, store state in Redis
let failureCount = 0;
let circuitOpen = false;
let nextAttemptAt = null;

const THRESHOLD = 5;     // open after 5 consecutive failures
const COOLDOWN_MS = 60000; // try again after 60 seconds

const ML_BASE = process.env.ML_URL || `http://localhost:5001`;

async function callML(endpoint, data, cacheKey = null) {
    // ── Check if circuit is open ──────────────────────
    if (circuitOpen) {
        const now = Date.now();
        if (now < nextAttemptAt) {
            // Circuit still open — return cache or fallback
            logger.warn(`ML circuit open. Attempt in ${Math.round((nextAttemptAt - now) / 1000)}s`);
            if (cacheKey && redis.status === 'ready') {
                const cached = await redis.get(cacheKey);
                if (cached) return { ...JSON.parse(cached), fromCache: true };
            }
            return { error: 'ML service temporarily unavailable', fallback: true };
        }
        // Cooldown elapsed — reset to half-open state
        circuitOpen = false;
        failureCount = 0;
        logger.info('ML circuit half-open — testing...');
    }

    // ── Attempt the ML call ───────────────────────────
    try {
        const response = await axios.post(
            `${ML_BASE}${endpoint}`,
            data,
            { timeout: 15000 }  // 15s hard timeout
        );

        // Success — reset failure count
        failureCount = 0;
        logger.debug(`ML call success: ${endpoint}`);
        return response.data;
    } catch (err) {
        failureCount++;
        logger.error(`ML failure ${failureCount}/${THRESHOLD}: ${err.message}`);

        // Trip the circuit after threshold failures
        if (failureCount >= THRESHOLD) {
            circuitOpen = true;
            nextAttemptAt = Date.now() + COOLDOWN_MS;
            logger.warn('ML circuit OPENED — using cache fallback');
        }

        // Try to serve stale cached data
        if (cacheKey && redis.status === 'ready') {
            const cached = await redis.get(cacheKey);
            if (cached) {
                logger.info('Serving stale cache for ML result');
                return { ...JSON.parse(cached), fromCache: true };
            }
        }

        // No cache available — surface the error
        throw err;
    }
}

// Status endpoint for health monitoring
function getCircuitStatus() {
    return {
        open: circuitOpen,
        failures: failureCount,
        nextAttempt: nextAttemptAt ? new Date(nextAttemptAt).toISOString() : null,
    };
}

module.exports = { callML, getCircuitStatus };
