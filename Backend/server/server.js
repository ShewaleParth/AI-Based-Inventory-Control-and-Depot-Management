require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');

// Configuration
const config = require('./config/env');
const connectDB = require('./config/database');

// Middleware
const authenticateToken = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');
const logger = require('./config/logger');

// Services
const { initializeEmailService } = require('./services/emailService');

// Routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const depotRoutes = require('./routes/depots');
const forecastRoutes = require('./routes/forecasts');
const transactionRoutes = require('./routes/transactions');
const dashboardRoutes = require('./routes/dashboard');
const reportsRoutes = require('./routes/reports');
const alertRoutes = require('./routes/alert');
const adminRoutes = require('./routes/admin');
const stockRequestRoutes = require('./routes/stockRequests');
const chatbotRoutes = require('./chatbot/chatRoutes');

// Note: Redis has been removed. Refresh tokens are stored in MongoDB (RefreshToken model).
// const reportQueue = require('./queues/reportQueue'); // Requires Redis — disabled

// Validate environment variables
config.validateEnv();

// Initialize Express app
const app = express();
const server = http.createServer(app);




// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true, // Required for httpOnly cookies to be sent cross-origin
}));
app.use(cookieParser()); // Parse cookies for refresh token
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Make models available to routes via app.locals
const models = require('./models');
app.locals.User = models.User;
app.locals.Product = models.Product;
app.locals.Depot = models.Depot;
app.locals.Transaction = models.Transaction;
app.locals.Forecast = models.Forecast;
app.locals.Alert = models.Alert;
app.locals.Report = models.Report;
app.locals.DepotAssignment = models.DepotAssignment;
app.locals.StockRequest = models.StockRequest;

// Initialize services
initializeEmailService();

// Connect to database
connectDB();

// Health check endpoint (public, not versioned)
app.get('/api/health', async (req, res) => {
  const mongoose = require('mongoose');
  const { getCircuitStatus } = require('./services/mlClient');

  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: 'disconnected',
    memory: process.memoryUsage(),
    ml: getCircuitStatus()
  };

  try {
    await mongoose.connection.db.admin().ping();
    health.database = 'connected';
  } catch (err) {
    health.status = 'degraded';
    health.database = 'disconnected';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

// ===== API Version 1 (v1) =====
const v1Router = express.Router();

// Public routes (no authentication required)
v1Router.use('/auth', authRoutes);

// Protected routes (authentication required)
v1Router.use('/products', authenticateToken, productRoutes);
v1Router.use('/depots', authenticateToken, depotRoutes);
v1Router.use('/forecasts', authenticateToken, forecastRoutes);
v1Router.use('/transactions', authenticateToken, transactionRoutes);
v1Router.use('/dashboard', authenticateToken, dashboardRoutes);
v1Router.use('/reports', authenticateToken, reportsRoutes);

// Bypass auth for /stream and use it for /alerts
const alertAuthMiddleware = (req, res, next) => {
  if (req.path === '/stream') return next();
  return authenticateToken(req, res, next);
};
v1Router.use('/alerts', alertAuthMiddleware, alertRoutes);
app.use('/api/alerts', alertAuthMiddleware, alertRoutes); // Alias for Action plan curl tests

v1Router.use('/admin', authenticateToken, adminRoutes);
v1Router.use('/stock-requests', authenticateToken, stockRequestRoutes);
v1Router.use('/chatbot', authenticateToken, chatbotRoutes);

// Mount the v1 API routes
app.use('/api/v1', v1Router);




// ── Pattern 2.1 Test Route ──────────────────────────
const { AppError, asyncWrap } = require('./middleware/errorHandler');
app.get('/api/test-error', asyncWrap(async (req, res) => {
  throw new AppError('test error triggered manually', 400, 'TEST_ERROR');
}));


// 404 handler — catches any route not matched above
app.use((req, res) => {
  res.status(404).json({
    error: `Route ${req.method} ${req.path} not found`,
    code: 'NOT_FOUND',
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Catch unhandled promise rejections (safety net)
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection:', reason);
  // Give server time to finish in-flight requests
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions gracefully
process.on('uncaughtException', err => {
  console.error("FATAL UNCAUGHT EXCEPTION:", err);
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  // In production, you might want to restart the process here
  process.exit(1);
});

// Start server
const PORT = config.PORT;
server.listen(PORT, () => {
  console.log(`\n Server running on port ${PORT}`);
  console.log(` Health check: http://localhost:${PORT}/api/health`);
  console.log(` API Base URL: http://localhost:${PORT}/api`);
  console.log(` Environment: ${config.NODE_ENV}\n`);
});

module.exports = { app, server };
