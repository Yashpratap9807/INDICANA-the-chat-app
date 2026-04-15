const mongoose = require('mongoose');

const connectionSchema = new mongoose.Schema(
  {
    requesterId: { type: String, required: true, index: true },
    receiverId:  { type: String, required: true, index: true },
    // pending → accepted | rejected
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  },
  { timestamps: true }
);

// A pair can only have one connection record at a time
connectionSchema.index({ requesterId: 1, receiverId: 1 }, { unique: true });

module.exports = mongoose.model('Connection', connectionSchema);
