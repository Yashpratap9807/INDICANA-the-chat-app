const express = require('express');
const { param } = require('express-validator');
const Follow = require('../models/Follow');
const User = require('../models/User');
const authenticate = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');
const { isBlockedBetween } = require('../utils/blocks');

const router = express.Router();

router.post(
  '/:userId',
  authenticate,
  [param('userId').notEmpty().withMessage('userId is required')],
  handleValidationErrors,
  async (req, res) => {
    const followerId = req.user.userId;
    const followingId = req.params.userId;

    if (followerId === followingId) {
      return res.status(400).json({ error: 'You cannot follow yourself' });
    }

    try {
      const target = await User.findOne({ userId: followingId }).lean();
      if (!target) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (await isBlockedBetween(followerId, followingId)) {
        return res.status(403).json({ error: 'You cannot follow this user right now' });
      }

      await Follow.updateOne(
        { followerId, followingId },
        { $setOnInsert: { followerId, followingId } },
        { upsert: true }
      );

      return res.status(201).json({ success: true, isFollowing: true });
    } catch (err) {
      console.error('Follow user error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.delete(
  '/:userId',
  authenticate,
  [param('userId').notEmpty().withMessage('userId is required')],
  handleValidationErrors,
  async (req, res) => {
    try {
      await Follow.deleteOne({
        followerId: req.user.userId,
        followingId: req.params.userId,
      });

      return res.json({ success: true, isFollowing: false });
    } catch (err) {
      console.error('Unfollow user error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

module.exports = router;
