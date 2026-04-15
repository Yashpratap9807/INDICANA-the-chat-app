const express = require('express');
const { body, param } = require('express-validator');
const Block = require('../models/Block');
const Follow = require('../models/Follow');
const Report = require('../models/Report');
const User = require('../models/User');
const authenticate = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');

const router = express.Router();

router.get('/blocks', authenticate, async (req, res) => {
  try {
    const blocks = await Block.find({ blockerId: req.user.userId }).lean();
    const blockedIds = blocks.map((item) => item.blockedId);
    const users = await User.find({ userId: { $in: blockedIds } }, 'userId username bio profilePhoto avatarHue').lean();
    return res.json(users);
  } catch (err) {
    console.error('List blocks error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/blocks/:userId',
  authenticate,
  [param('userId').notEmpty().withMessage('userId is required')],
  handleValidationErrors,
  async (req, res) => {
    const blockerId = req.user.userId;
    const blockedId = req.params.userId;

    if (blockerId === blockedId) {
      return res.status(400).json({ error: 'You cannot block yourself' });
    }

    try {
      const target = await User.findOne({ userId: blockedId }).lean();
      if (!target) {
        return res.status(404).json({ error: 'User not found' });
      }

      await Block.updateOne(
        { blockerId, blockedId },
        { $setOnInsert: { blockerId, blockedId } },
        { upsert: true }
      );

      await Follow.deleteMany({
        $or: [
          { followerId: blockerId, followingId: blockedId },
          { followerId: blockedId, followingId: blockerId },
        ],
      });

      return res.status(201).json({ success: true, blocked: true });
    } catch (err) {
      console.error('Block user error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.delete(
  '/blocks/:userId',
  authenticate,
  [param('userId').notEmpty().withMessage('userId is required')],
  handleValidationErrors,
  async (req, res) => {
    try {
      await Block.deleteOne({
        blockerId: req.user.userId,
        blockedId: req.params.userId,
      });

      return res.json({ success: true, blocked: false });
    } catch (err) {
      console.error('Unblock user error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.post(
  '/reports',
  authenticate,
  [
    body('targetUserId').notEmpty().withMessage('targetUserId is required'),
    body('reason')
      .trim()
      .isLength({ min: 5, max: 500 })
      .withMessage('Reason must be 5 to 500 characters'),
  ],
  handleValidationErrors,
  async (req, res) => {
    const { targetUserId, reason } = req.body;

    if (targetUserId === req.user.userId) {
      return res.status(400).json({ error: 'You cannot report yourself' });
    }

    try {
      const target = await User.findOne({ userId: targetUserId }).lean();
      if (!target) {
        return res.status(404).json({ error: 'User not found' });
      }

      await Report.create({
        reporterId: req.user.userId,
        targetUserId,
        reason: reason.trim(),
      });

      return res.status(201).json({ success: true });
    } catch (err) {
      console.error('Report user error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

module.exports = router;
