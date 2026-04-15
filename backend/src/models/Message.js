const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderId:   { type: String, required: true, index: true },
  receiverId: { type: String, required: true, index: true },
  clientId:   { type: String, required: true },
  // 'text' or 'image'
  type:       { type: String, enum: ['text', 'image'], default: 'text' },
  // Base64-encoded XSalsa20-Poly1305 ciphertext — server never decrypts this
  ciphertext: { type: String, required: true },
  // Base64-encoded 24-byte nonce
  nonce:      { type: String, required: true },
  timestamp:  { type: Date, default: Date.now, index: true },
  deliveredAt:{ type: Date, default: null },
  seenAt:     { type: Date, default: null },
});

messageSchema.index({ senderId: 1, receiverId: 1, timestamp: 1 });
messageSchema.index({ senderId: 1, clientId: 1 }, { unique: true });
// Replay attack prevention
messageSchema.index({ senderId: 1, nonce: 1 }, { unique: true });

module.exports = mongoose.model('Message', messageSchema);
