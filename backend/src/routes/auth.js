const express = require('express');
const { body } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const PhoneOTP = require('../models/PhoneOTP');
const PasswordResetOTP = require('../models/PasswordResetOTP');
const DeviceSession = require('../models/DeviceSession');
const authenticate = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');
const { createSessionForRequest } = require('../utils/sessions');

const router = express.Router();

const registerValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 32 })
    .withMessage('Username must be 3-32 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username may only contain letters, numbers, and underscores'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('publicKey')
    .isBase64()
    .withMessage('publicKey must be a Base64-encoded X25519 key'),
  body('bio')
    .optional()
    .trim()
    .isLength({ max: 160 })
    .withMessage('Bio must be at most 160 characters'),
  body('phone')
    .optional({ values: 'falsy' })
    .matches(/^\+[1-9]\d{6,14}$/)
    .withMessage('Phone must be in E.164 format (+919876543210)'),
];

const loginValidation = [
  body('username').trim().notEmpty().withMessage('username is required'),
  body('password').notEmpty().withMessage('password is required'),
];

const verifyLoginOtpValidation = [
  body('loginToken').notEmpty().withMessage('loginToken is required'),
  body('otp')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('OTP must be 6 digits'),
];

const passwordResetRequestValidation = [
  body('username').trim().notEmpty().withMessage('username is required'),
];

const passwordResetValidation = [
  body('resetToken').notEmpty().withMessage('resetToken is required'),
  body('otp')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('OTP must be 6 digits'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters'),
];

function issueAuthToken(user, sessionId) {
  return jwt.sign(
    { userId: user.userId, username: user.username, sessionId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
}

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const loginAttempts = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

function loginKey(req, username) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  return `${ip}:${String(username).toLowerCase()}`;
}

function checkLoginThrottle(req, username) {
  const key = loginKey(req, username);
  const current = loginAttempts.get(key);
  if (!current) return null;

  if (current.lockUntil && current.lockUntil > Date.now()) {
    return Math.ceil((current.lockUntil - Date.now()) / 60000);
  }

  if (current.lastFailureAt && Date.now() - current.lastFailureAt > LOCKOUT_WINDOW_MS) {
    loginAttempts.delete(key);
  }

  return null;
}

function recordLoginFailure(req, username) {
  const key = loginKey(req, username);
  const current = loginAttempts.get(key) || { failures: 0, lastFailureAt: 0, lockUntil: 0 };
  const now = Date.now();

  if (now - current.lastFailureAt > LOCKOUT_WINDOW_MS) {
    current.failures = 0;
  }

  current.failures += 1;
  current.lastFailureAt = now;
  if (current.failures >= MAX_FAILED_ATTEMPTS) {
    current.lockUntil = now + LOCKOUT_DURATION_MS;
  }

  loginAttempts.set(key, current);
}

function clearLoginFailures(req, username) {
  loginAttempts.delete(loginKey(req, username));
}

router.post('/register', registerValidation, handleValidationErrors, async (req, res) => {
  const { username, password, publicKey, bio = '', phone = '' } = req.body;

  try {
    const existing = await User.findOne({
      $or: [
        { username },
        ...(phone ? [{ phone }] : []),
      ],
    });
    if (existing?.username === username) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    if (phone && existing?.phone === phone) {
      return res.status(409).json({ error: 'Phone already in use' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({
      userId: uuidv4(),
      username,
      passwordHash,
      publicKey,
      bio: bio.trim(),
      phone: phone || undefined,
    });
    await user.save();

    const session = await createSessionForRequest(req, user.userId);
    const token = issueAuthToken(user, session.sessionId);

    return res.status(201).json({
      token,
      sessionId: session.sessionId,
      user: user.toPublicJSON(),
    });
  } catch (err) {
    console.error('Register error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', loginValidation, handleValidationErrors, async (req, res) => {
  const { username, password } = req.body;

  const lockedMinutes = checkLoginThrottle(req, username);
  if (lockedMinutes) {
    return res.status(429).json({ error: `Too many login attempts. Try again in ${lockedMinutes} minute(s).` });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) {
      recordLoginFailure(req, username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      recordLoginFailure(req, username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    clearLoginFailures(req, username);

    if (user.twoFactorEnabled && user.phone && user.phoneVerified) {
      const otp = generateOTP();
      await PhoneOTP.findOneAndUpdate(
        { phone: user.phone },
        { otp, createdAt: new Date() },
        { upsert: true, new: true }
      );

      console.log(`\nOTP login code for ${user.phone}: [ ${otp} ]\n`);

      const loginToken = jwt.sign(
        {
          purpose: 'login_otp',
          userId: user.userId,
          username: user.username,
          phone: user.phone,
        },
        process.env.JWT_SECRET,
        { expiresIn: '10m' }
      );

      return res.status(200).json({
        requiresOtp: true,
        loginToken,
        phoneHint: user.phone.slice(-4),
      });
    }

    const session = await createSessionForRequest(req, user.userId);
    const token = issueAuthToken(user, session.sessionId);

    return res.status(200).json({
      token,
      sessionId: session.sessionId,
      user: user.toPublicJSON(),
    });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login/verify-otp', verifyLoginOtpValidation, handleValidationErrors, async (req, res) => {
  const { loginToken, otp } = req.body;

  try {
    const payload = jwt.verify(loginToken, process.env.JWT_SECRET);
    if (payload.purpose !== 'login_otp') {
      return res.status(400).json({ error: 'Invalid login verification token' });
    }

    const record = await PhoneOTP.findOne({ phone: payload.phone });
    if (!record || record.otp !== otp) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    await PhoneOTP.deleteOne({ phone: payload.phone });

    const user = await User.findOne({ userId: payload.userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const session = await createSessionForRequest(req, user.userId);
    const token = issueAuthToken(user, session.sessionId);

    return res.status(200).json({
      token,
      sessionId: session.sessionId,
      user: user.toPublicJSON(),
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
      return res.status(400).json({ error: 'Login verification expired. Please sign in again.' });
    }

    console.error('Verify login OTP error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/password/request-reset', passwordResetRequestValidation, handleValidationErrors, async (req, res) => {
  const { username } = req.body;

  try {
    const user = await User.findOne({ username }).lean();
    if (!user || !user.phone || !user.phoneVerified) {
      return res.status(404).json({ error: 'No verified phone is available for that account' });
    }

    const otp = generateOTP();
    await PasswordResetOTP.findOneAndUpdate(
      { userId: user.userId },
      { otp, createdAt: new Date() },
      { upsert: true, new: true }
    );

    console.log(`\nPassword reset code for ${user.username} (${user.phone}): [ ${otp} ]\n`);

    const resetToken = jwt.sign(
      {
        purpose: 'password_reset',
        userId: user.userId,
        username: user.username,
      },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );

    return res.json({
      success: true,
      resetToken,
      phoneHint: user.phone.slice(-4),
    });
  } catch (err) {
    console.error('Request password reset error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/password/reset', passwordResetValidation, handleValidationErrors, async (req, res) => {
  const { resetToken, otp, newPassword } = req.body;

  try {
    const payload = jwt.verify(resetToken, process.env.JWT_SECRET);
    if (payload.purpose !== 'password_reset') {
      return res.status(400).json({ error: 'Invalid reset token' });
    }

    const record = await PasswordResetOTP.findOne({ userId: payload.userId });
    if (!record || record.otp !== otp) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await User.updateOne({ userId: payload.userId }, { $set: { passwordHash } });
    await PasswordResetOTP.deleteOne({ userId: payload.userId });
    await DeviceSession.updateMany(
      { userId: payload.userId, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );

    return res.json({ success: true });
  } catch (err) {
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
      return res.status(400).json({ error: 'Reset session expired. Request a new OTP.' });
    }

    console.error('Reset password error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', authenticate, async (req, res) => {
  try {
    if (req.user.sessionId) {
      await DeviceSession.updateOne(
        { sessionId: req.user.sessionId, userId: req.user.userId },
        { $set: { revokedAt: new Date() } }
      );
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Logout error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
