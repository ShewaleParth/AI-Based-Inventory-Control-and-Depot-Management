const mongoose = require('mongoose');

const stockRequestSchema = new mongoose.Schema({
    requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    productName: {
        type: String,
        required: true
    },
    productSku: {
        type: String,
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    fromDepotId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Depot',
        required: true
    },
    fromDepotName: {
        type: String,
        required: true
    },
    toDepotId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Depot',
        required: true
    },
    toDepotName: {
        type: String,
        required: true
    },
    reason: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
        index: true
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reviewedAt: {
        type: Date
    },
    reviewNotes: {
        type: String,
        default: ''
    }
}, { timestamps: true });

module.exports = mongoose.model('StockRequest', stockRequestSchema);
