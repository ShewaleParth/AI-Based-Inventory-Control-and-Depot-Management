const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

// Different formats for dev vs production
const devFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) =>
        `${timestamp} [${level}] ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''
        }`
    )
);

const prodFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()  // machine-readable in production
);

const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
    format: process.env.NODE_ENV === 'production'
        ? prodFormat : devFormat,
    transports: [
        new winston.transports.Console(),
        // Rotating file: new log file every day, keep 14 days
        new DailyRotateFile({
            filename: 'logs/error-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            maxFiles: '14d',
        }),
        new DailyRotateFile({
            filename: 'logs/combined-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxFiles: '7d',
        }),
    ],
});

module.exports = logger;
