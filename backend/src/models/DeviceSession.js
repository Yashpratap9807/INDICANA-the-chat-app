const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const deviceSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, default: uuidv4, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    deviceName: { type: String, default: 'Unknown device' },
    userAgent: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
    lastSeenAt: { type: Date, default: Date.now, index: true },
    revokedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DeviceSession', deviceSessionSchema);
