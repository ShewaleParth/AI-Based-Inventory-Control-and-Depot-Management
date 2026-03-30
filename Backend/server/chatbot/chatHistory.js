const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  // Agentic metadata — action log per assistant message
  metadata: {
    actionsLog: [
      {
        toolName: String,
        params: mongoose.Schema.Types.Mixed,
        success: Boolean,
        message: String,
        timestamp: String
      }
    ],
    hasPendingAction: { type: Boolean, default: false },
    confirmed: { type: Boolean, default: false },
    iterationsUsed: Number
  }
});

const chatSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  messages: [messageSchema],
  title: {
    type: String,
    default: 'New Chat'
  },
  // Serialised JSON of the pending action awaiting user confirmation
  pendingAction: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

chatSessionSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

chatSessionSchema.index({ sessionId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('ChatSession', chatSessionSchema);
