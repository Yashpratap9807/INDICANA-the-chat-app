const express = require('express');
const { param } = require('express-validator');
const User = require('../models/User');
const authenticate = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');
const { getBlockedUserIds, getBlockState } = require('../utils/blocks');

const router = express.Router();

// ─── GET /keys/users — list all users (for user discovery) ───────────────────

router.get('/users', authenticate, async (req, res) => {
  try {
    const blockedUserIds = await getBlockedUserIds(req.user.userId);
    const users = await User.find({}, 'userId username publicKey bio profilePhoto avatarHue phoneVerified').lean();
    // Exclude the requester themselves
    const others = users.filter((u) => u.userId !== req.user.userId && !blockedUserIds.includes(u.userId));
    return res.json(others);
  } catch (err) {
    console.error('List users error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /keys/public-key/:userId ─────────────────────────────────────────────

router.get(
  '/public-key/:userId',
  authenticate,
  [param('userId').notEmpty().withMessage('userId is required')],
  handleValidationErrors,
  async (req, res) => {
    try {
      const blockState = await getBlockState(req.user.userId, req.params.userId);
      if (blockState.blockedByUser) {
        return res.status(403).json({ error: 'This profile is unavailable' });
      }

      const user = await User.findOne(
        { userId: req.params.userId },
        'userId username publicKey bio profilePhoto avatarHue phoneVerified'
      ).lean();
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.json(user);
    } catch (err) {
      console.error('Get public-key error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

module.exports = router;
