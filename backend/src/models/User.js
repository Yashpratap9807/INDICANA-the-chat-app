const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const userSchema = new mongoose.Schema(
  {
    userId: { type: String, default: uuidv4, unique: true, index: true },
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 32 },
    passwordHash: { type: String, required: true },
    // X25519 public key — Base64
    publicKey: { type: String, required: true },
    // Optional phone (E.164 format e.g. +919876543210)
    phone: { type: String, unique: true, sparse: true, trim: true },
    phoneVerified: { type: Boolean, default: false },
    twoFactorEnabled: { type: Boolean, default: false },
    bio: { type: String, maxlength: 160, default: '' },
    profilePhoto: { type: String, default: '' },
    // Tailwind-compatible HSL hue 0-360 for generated avatar colour
    avatarHue: { type: Number, default: () => Math.floor(Math.random() * 360) },
  },
  { timestamps: true }
);

userSchema.methods.toPublicJSON = function () {
  return {
    userId: this.userId,
    username: this.username,
    publicKey: this.publicKey,
    bio: this.bio,
    phone: this.phone || '',
    profilePhoto: this.profilePhoto,
    avatarHue: this.avatarHue,
    phoneVerified: this.phoneVerified,
    twoFactorEnabled: this.twoFactorEnabled,
  };
};

module.exports = mongoose.model('User', userSchema);
