const express = require('express');
const { body, param } = require('express-validator');
const User = require('../models/User');
const Follow = require('../models/Follow');
const authenticate = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');
const { getBlockState } = require('../utils/blocks');

const router = express.Router();

function isValidProfilePhoto(value) {
  if (value === '' || value === null || value === undefined) return true;
  return typeof value === 'string'
    && value.startsWith('data:image/')
    && value.length <= 2_500_000;
}

async function buildProfile(targetUserId, viewerUserId) {
  const user = await User.findOne({ userId: targetUserId }).lean();
  if (!user) return null;

  const blockState = await getBlockState(viewerUserId, targetUserId);

  const [followersCount, followingCount, isFollowingDoc, followsYouDoc] = await Promise.all([
    Follow.countDocuments({ followingId: targetUserId }),
    Follow.countDocuments({ followerId: targetUserId }),
    viewerUserId && viewerUserId !== targetUserId
      ? Follow.findOne({ followerId: viewerUserId, followingId: targetUserId }).lean()
      : null,
    viewerUserId && viewerUserId !== targetUserId
      ? Follow.findOne({ followerId: targetUserId, followingId: viewerUserId }).lean()
      : null,
  ]);

  return {
    userId: user.userId,
    username: user.username,
    publicKey: user.publicKey,
    bio: user.bio || '',
    phone: viewerUserId === targetUserId ? (user.phone || '') : '',
    profilePhoto: user.profilePhoto || '',
    avatarHue: user.avatarHue,
    phoneVerified: user.phoneVerified,
    twoFactorEnabled: user.twoFactorEnabled,
    hasBlocked: blockState.hasBlocked,
    blockedByUser: blockState.blockedByUser,
    followersCount,
    followingCount,
    isFollowing: Boolean(isFollowingDoc),
    followsYou: Boolean(followsYouDoc),
    isMe: viewerUserId === targetUserId,
  };
}

router.get('/me', authenticate, async (req, res) => {
  try {
    const profile = await buildProfile(req.user.userId, req.user.userId);
    return res.json(profile);
  } catch (err) {
    console.error('Get my profile error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch(
  '/me',
  authenticate,
  [
    body('bio')
      .optional()
      .isLength({ max: 160 })
      .withMessage('Bio must be at most 160 characters'),
    body('profilePhoto')
      .optional({ nullable: true })
      .custom(isValidProfilePhoto)
      .withMessage('profilePhoto must be an image data URL under 2.5 MB'),
    body('twoFactorEnabled')
      .optional()
      .isBoolean()
      .withMessage('twoFactorEnabled must be true or false'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const updates = {};

      if (typeof req.body.bio === 'string') {
        updates.bio = req.body.bio.trim();
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'profilePhoto')) {
        updates.profilePhoto = req.body.profilePhoto || '';
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'twoFactorEnabled')) {
        const requestedState = Boolean(req.body.twoFactorEnabled);
        if (requestedState) {
          const me = await User.findOne({ userId: req.user.userId }, 'phone phoneVerified').lean();
          if (!me?.phone || !me.phoneVerified) {
            return res.status(400).json({ error: 'Verify a phone number before enabling 2FA' });
          }
        }
        updates.twoFactorEnabled = requestedState;
      }

      await User.updateOne({ userId: req.user.userId }, { $set: updates });
      const profile = await buildProfile(req.user.userId, req.user.userId);
      return res.json(profile);
    } catch (err) {
      console.error('Update my profile error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/:userId',
  authenticate,
  [param('userId').notEmpty().withMessage('userId is required')],
  handleValidationErrors,
  async (req, res) => {
    try {
      const profile = await buildProfile(req.params.userId, req.user.userId);
      if (!profile) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (profile.blockedByUser) {
        return res.status(403).json({ error: 'This profile is unavailable' });
      }
      return res.json(profile);
    } catch (err) {
      console.error('Get profile error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

module.exports = router;
