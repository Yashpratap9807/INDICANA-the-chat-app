const express = require('express');
const User = require('../models/User');
const authenticate = require('../middleware/auth');
const { getBlockedUserIds } = require('../utils/blocks');

const router = express.Router();

// ── GET /search/users?q=<query> ───────────────────────────────────
// Returns matching users (by username substring or exact phone).
// Does NOT return the requesting user. Does NOT expose phone numbers.
router.get('/users', authenticate, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  try {
    const blockedUserIds = await getBlockedUserIds(req.user.userId);
    let filter;
    // Phone search (E.164 — starts with +)
    if (q.startsWith('+')) {
      filter = { phone: q, userId: { $ne: req.user.userId } };
    } else {
      // Username substring search (case-insensitive)
      filter = {
        username: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' },
        userId: { $ne: req.user.userId },
      };
    }

    const users = await User.find(filter, 'userId username publicKey bio profilePhoto avatarHue phoneVerified')
      .sort({ username: 1 })
      .limit(50)
      .lean();
    return res.json(users.filter((user) => !blockedUserIds.includes(user.userId)).slice(0, 20));
  } catch (err) {
    console.error('Search error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
