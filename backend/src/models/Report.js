const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    reporterId: { type: String, required: true, index: true },
    targetUserId: { type: String, required: true, index: true },
    reason: { type: String, required: true, maxlength: 500 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Report', reportSchema);
