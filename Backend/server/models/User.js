const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  first_name: { type: String, required: true },
  last_name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isVerified: { type: Boolean, default: false },
  otp: { type: String },
  otpExpiry: { type: Date },
  role: { type: String, enum: ['admin', 'manager', 'staff', 'viewer'], default: 'staff' },
  // Organization: admin's own _id for admins, admin's _id for invited employees
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Who invited this user (null for self-registered admins)
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  avatar: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);

