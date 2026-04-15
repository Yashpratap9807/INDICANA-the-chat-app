const express = require('express');
const { param } = require('express-validator');
const DeviceSession = require('../models/DeviceSession');
const authenticate = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const sessions = await DeviceSession.find({
      userId: req.user.userId,
      revokedAt: null,
    })
      .sort({ lastSeenAt: -1, createdAt: -1 })
      .lean();

    return res.json(sessions.map((session) => ({
      sessionId: session.sessionId,
      deviceName: session.deviceName,
      ipAddress: session.ipAddress,
      lastSeenAt: session.lastSeenAt,
      createdAt: session.createdAt,
      isCurrent: session.sessionId === req.user.sessionId,
    })));
  } catch (err) {
    console.error('List sessions error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/current', authenticate, async (req, res) => {
  try {
    if (req.user.sessionId) {
      await DeviceSession.updateOne(
        { sessionId: req.user.sessionId, userId: req.user.userId },
        { $set: { revokedAt: new Date() } }
      );
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Logout current session error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete(
  '/:sessionId',
  authenticate,
  [param('sessionId').notEmpty().withMessage('sessionId is required')],
  handleValidationErrors,
  async (req, res) => {
    try {
      const session = await DeviceSession.findOne({
        sessionId: req.params.sessionId,
        userId: req.user.userId,
        revokedAt: null,
      });

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      session.revokedAt = new Date();
      await session.save();

      return res.json({ success: true, sessionId: session.sessionId });
    } catch (err) {
      console.error('Revoke session error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

module.exports = router;
