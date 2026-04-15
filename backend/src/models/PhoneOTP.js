const mongoose = require('mongoose');

const phoneOTPSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  otp:   { type: String, required: true },
  // TTL: MongoDB auto-deletes the document after 600 seconds (10 min)
  createdAt: { type: Date, default: Date.now, expires: 600 },
});

module.exports = mongoose.model('PhoneOTP', phoneOTPSchema);
