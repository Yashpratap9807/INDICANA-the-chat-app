const express = require('express');
const { body } = require('express-validator');
const jwt = require('jsonwebtoken');
const PhoneOTP = require('../models/PhoneOTP');
const User = require('../models/User');
const authenticate = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');

const router = express.Router();
const otpCooldowns = new Map();
const OTP_SEND_COOLDOWN_MS = 60 * 1000;

// ── Generate a 6-digit OTP ────────────────────────────────────────
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function requesterKey(req, phone) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  return `${ip}:${phone}`;
}

function checkOtpCooldown(req, phone) {
  const key = requesterKey(req, phone);
  const sentAt = otpCooldowns.get(key);
  if (!sentAt) return 0;

  const remaining = OTP_SEND_COOLDOWN_MS - (Date.now() - sentAt);
  if (remaining <= 0) {
    otpCooldowns.delete(key);
    return 0;
  }

  return Math.ceil(remaining / 1000);
}

function markOtpSent(req, phone) {
  otpCooldowns.set(requesterKey(req, phone), Date.now());
}

function getOptionalRequesterUserId(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  try {
    const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
    return payload.userId || null;
  } catch {
    return null;
  }
}

// ── POST /phone/send-otp ──────────────────────────────────────────
// Works pre-login (for registration) and post-login (for re-verification)
router.post(
  '/send-otp',
  [body('phone').matches(/^\+[1-9]\d{6,14}$/).withMessage('Phone must be in E.164 format (+919876543210)')],
  handleValidationErrors,
  async (req, res) => {
    const { phone } = req.body;

    try {
      const requesterUserId = getOptionalRequesterUserId(req);
      const existingOwner = await User.findOne({ phone }, 'userId').lean();
      if (existingOwner && existingOwner.userId !== requesterUserId) {
        return res.status(409).json({ error: 'Phone already in use' });
      }

      const cooldownSeconds = checkOtpCooldown(req, phone);
      if (cooldownSeconds) {
        return res.status(429).json({ error: `Please wait ${cooldownSeconds} second(s) before requesting another OTP.` });
      }

      const otp = generateOTP();

      await PhoneOTP.findOneAndUpdate(
        { phone },
        { otp, createdAt: new Date() },
        { upsert: true, new: true }
      );
      markOtpSent(req, phone);

      // ── In production: replace with Twilio SMS ────────────────
      // const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      // await twilio.messages.create({ body: `INDICANA code: ${otp}`, from: process.env.TWILIO_FROM, to: phone });
      // ─────────────────────────────────────────────────────────

      // DEV MODE: log OTP to console
      console.log(`\n📱  OTP for ${phone}: [ ${otp} ]  (expires in 10 min)\n`);

      return res.json({ message: 'OTP sent (check server console in dev mode)' });
    } catch (err) {
      console.error('send-otp error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ── POST /phone/verify ────────────────────────────────────────────
router.post(
  '/verify',
  authenticate,
  [
    body('phone').matches(/^\+[1-9]\d{6,14}$/).withMessage('Invalid phone format'),
    body('otp').isLength({ min: 6, max: 6 }).isNumeric().withMessage('OTP must be 6 digits'),
  ],
  handleValidationErrors,
  async (req, res) => {
    const { phone, otp } = req.body;
    const userId = req.user.userId;

    try {
      const existingOwner = await User.findOne({ phone }, 'userId').lean();
      if (existingOwner && existingOwner.userId !== userId) {
        return res.status(409).json({ error: 'Phone already in use' });
      }

      const record = await PhoneOTP.findOne({ phone });
      if (!record || record.otp !== otp) {
        return res.status(400).json({ error: 'Invalid or expired OTP' });
      }

      await User.updateOne({ userId }, { phone, phoneVerified: true });
      await PhoneOTP.deleteOne({ phone });

      return res.json({ success: true });
    } catch (err) {
      console.error('verify OTP error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

module.exports = router;
