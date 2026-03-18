// Central export for all models
const User = require('./User');
const Product = require('./Product');
const Depot = require('./Depot');
const Transaction = require('./Transaction');
const Forecast = require('./Forecast');
const Alert = require('./Alert');
const Report = require('./Report');
const DepotAssignment = require('./DepotAssignment');
const StockRequest = require('./StockRequest');
const DepotStock = require('./DepotStock');
const RefreshToken = require('./RefreshToken');

module.exports = {
  User,
  Product,
  Depot,
  Transaction,
  Forecast,
  Alert,
  Report,
  DepotAssignment,
  StockRequest,
  DepotStock,
  RefreshToken
};

