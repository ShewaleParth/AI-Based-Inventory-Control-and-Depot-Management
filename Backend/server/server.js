require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const socketio = require('socket.io');

// Configuration
const config = require('./config/env');
const connectDB = require('./config/database');

// Middleware
const authenticateToken = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

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

// Initialize Redis (Upstash REST API)
const { redis } = require('./config/redis');
// TODO: Bull queue requires TCP Redis, not REST API
// const reportQueue = require('./queues/reportQueue');

// Validate environment variables
config.validateEnv();

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = socketio(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

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

// Health check endpoint (public)
app.get('/api/health', async (req, res) => {
  const mongoose = require('mongoose');
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: 'disconnected',
    redis: 'disconnected',
    memory: process.memoryUsage()
  };
  
  try {
    await mongoose.connection.db.admin().ping();
    health.database = 'connected';
  } catch (err) {
    health.status = 'degraded';
    health.database = 'disconnected';
  }
  
  try {
    await redis.ping();
    health.redis = 'connected';
  } catch (err) {
    health.redis = 'disconnected';
  }
  
  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Public routes (no authentication required)
app.use('/api/auth', authRoutes);

// Protected routes (authentication required)
app.use('/api/products', authenticateToken, productRoutes);
app.use('/api/depots', authenticateToken, depotRoutes);
app.use('/api/forecasts', authenticateToken, forecastRoutes);
app.use('/api/transactions', authenticateToken, transactionRoutes);
app.use('/api/dashboard', authenticateToken, dashboardRoutes);
app.use('/api/reports', authenticateToken, reportsRoutes);
app.use('/api/alerts', authenticateToken, alertRoutes);
app.use('/api/admin', authenticateToken, adminRoutes);
app.use('/api/stock-requests', authenticateToken, stockRequestRoutes);

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(' New client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log(' Client disconnected:', socket.id);
  });
});

// Make io accessible to routes if needed
app.set('io', io);

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const PORT = config.PORT;
server.listen(PORT, () => {
  console.log(`\n Server running on port ${PORT}`);
  console.log(` Health check: http://localhost:${PORT}/api/health`);
  console.log(` API Base URL: http://localhost:${PORT}/api`);
  console.log(` Environment: ${config.NODE_ENV}\n`);
});

module.exports = { app, server, io };
