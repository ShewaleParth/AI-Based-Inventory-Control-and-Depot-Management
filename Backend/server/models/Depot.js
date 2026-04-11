const mongoose = require('mongoose');

const depotSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  location: { type: String, required: true },
  pincode: { type: String, default: '' },
  capacity: { type: Number, required: true },
  currentUtilization: { type: Number, default: 0 },
  lat: { type: Number, default: null },
  lng: { type: Number, default: null },
  itemsStored: { type: Number, default: 0 },
  products: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    productName: String,
    productSku: String,
    quantity: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
  }],
  status: {
    type: String,
    enum: ['normal', 'warning', 'critical'],
    default: 'normal'
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Pre-save hook to calculate derived fields from actual inventory data
depotSchema.pre('save', function (next) {
  // Calculate currentUtilization from products array (sum of all quantities)
  if (this.products && this.products.length > 0) {
    this.currentUtilization = this.products.reduce((total, product) => total + (product.quantity || 0), 0);
  } else {
    this.currentUtilization = 0;
  }

  // Calculate itemsStored (number of unique SKUs)
  this.itemsStored = this.products ? this.products.length : 0;

  // Calculate status based on utilization percentage
  const utilizationPercent = this.capacity > 0 ? (this.currentUtilization / this.capacity) * 100 : 0;

  if (utilizationPercent >= 95) {
    this.status = 'critical';
  } else if (utilizationPercent >= 85) {
    this.status = 'warning';
  } else {
    this.status = 'normal';
  }

  // Update timestamp
  this.updatedAt = new Date();

  next();
});

module.exports = mongoose.model('Depot', depotSchema);
