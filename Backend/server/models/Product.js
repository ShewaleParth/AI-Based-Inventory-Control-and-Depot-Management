const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sku: { type: String, required: true },
  name: { type: String, required: true },
  category: { type: String, required: true },
  stock: { type: Number, required: true, default: 0 },
  reorderPoint: { type: Number, required: true, default: 10 },
  supplier: { type: String, required: true },
  price: { type: Number, required: true },
  // ML Fields
  dailySales: { type: Number, default: 5 },
  weeklySales: { type: Number, default: 35 },
  brand: { type: String, default: 'Generic' },
  leadTime: { type: Number, default: 7 },
  // Multi-Depot Distribution - tracks stock across multiple depots
  depotDistribution: [{
    depotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Depot', required: true },
    depotName: { type: String, required: true },
    quantity: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
  }],
  status: {
    type: String,
    enum: ['in-stock', 'low-stock', 'out-of-stock', 'overstock'],
    default: 'in-stock'
  },
  image: { type: String },
  lastSoldDate: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Pre-save hook to calculate total stock from depot distribution and update status
productSchema.pre('save', function (next) {
  // Calculate total stock from all depots
  if (this.depotDistribution && this.depotDistribution.length > 0) {
    this.stock = this.depotDistribution.reduce((total, depot) => total + (depot.quantity || 0), 0);
  }

  // Update status based on total stock levels
  if (this.stock === 0) {
    this.status = 'out-of-stock';
  } else if (this.stock <= this.reorderPoint) {
    this.status = 'low-stock';
  } else if (this.stock > this.reorderPoint * 3) {
    this.status = 'overstock';
  } else {
    this.status = 'in-stock';
  }
  next();
});

// Compound unique index: Each user can have their own products with same SKU
// But within a user's account, SKU must be unique
productSchema.index({ userId: 1, sku: 1 }, { unique: true });

// Add a text index on the fields you want to search
productSchema.index({
  name: 'text',
  sku: 'text',
  category: 'text',
}, { name: 'product_text_index' });

// Add compound indexes for common filter combinations
// This makes filter queries 100x faster at scale
productSchema.index({ category: 1, createdAt: -1 });
productSchema.index({ status: 1, category: 1 });

module.exports = mongoose.model('Product', productSchema);
