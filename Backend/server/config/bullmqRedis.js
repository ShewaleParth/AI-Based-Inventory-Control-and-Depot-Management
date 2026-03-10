const { Redis } = require('ioredis');
const logger = require('./logger');

const redisOptions = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy(times) {
        if (times > 3) return null; // stop retrying after 3 attempts if host not found
        return Math.min(times * 500, 2000);
    }
};

// Upstash requires TLS for native Redis connections
if (process.env.REDIS_HOST && process.env.REDIS_HOST.includes('upstash.io')) {
    redisOptions.tls = { rejectUnauthorized: true };
}

const bullmqRedis = new Redis(redisOptions);

let errorLogged = false;
bullmqRedis.on('connect', () => logger.info('BullMQ ioredis connected'));
bullmqRedis.on('error', err => {
    if (!errorLogged) {
        logger.error('BullMQ ioredis connection failed (Queue disabled): ' + err.message);
        errorLogged = true;
    }
});

module.exports = bullmqRedis;
