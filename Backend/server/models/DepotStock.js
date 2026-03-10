const mongoose = require('mongoose');

// Backend/server/models/DepotStock.js — add these indexes
const DepotStockSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', required: true
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product', required: true
    },
    depotId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Depot', required: true
    },
    quantity: { type: Number, default: 0, min: 0 },
    // min: 0 prevents negative stock at the schema level
}, { timestamps: true });

// Compound unique index: one record per product per depot within a user organization
DepotStockSchema.index(
    { userId: 1, productId: 1, depotId: 1 },
    { unique: true }
);

module.exports = mongoose.model('DepotStock', DepotStockSchema);
