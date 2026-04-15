const mongoose = require('mongoose');

const passwordResetOTPSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  otp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 600 },
});

module.exports = mongoose.model('PasswordResetOTP', passwordResetOTPSchema);
