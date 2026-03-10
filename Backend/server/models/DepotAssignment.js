const mongoose = require('mongoose');

const depotAssignmentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  depotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Depot',
    required: true,
    index: true
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  permissions: {
    canStockIn: { type: Boolean, default: true },
    canStockOut: { type: Boolean, default: true },
    canTransfer: { type: Boolean, default: true },
    canEditDepot: { type: Boolean, default: false }
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  assignedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Prevent duplicate assignment
depotAssignmentSchema.index({ userId: 1, depotId: 1 }, { unique: true });

module.exports = mongoose.model('DepotAssignment', depotAssignmentSchema);
