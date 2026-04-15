const express = require('express');
const { body, param } = require('express-validator');
const Connection = require('../models/Connection');
const User = require('../models/User');
const authenticate = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');
const { deliverToUser } = require('../websocket/hub');

const router = express.Router();

// ── POST /connections/request ─────────────────────────────────────
router.post(
  '/request',
  authenticate,
  [body('receiverId').notEmpty().withMessage('receiverId is required')],
  handleValidationErrors,
  async (req, res) => {
    const requesterId = req.user.userId;
    const { receiverId } = req.body;

    if (requesterId === receiverId) {
      return res.status(400).json({ error: 'Cannot connect with yourself' });
    }

    try {
      // Check target user exists
      const target = await User.findOne({ userId: receiverId });
      if (!target) return res.status(404).json({ error: 'User not found' });

      // Check if connection already exists in either direction
      const existing = await Connection.findOne({
        $or: [
          { requesterId, receiverId },
          { requesterId: receiverId, receiverId: requesterId },
        ],
      });

      if (existing) {
        return res.status(409).json({ error: 'Connection already exists', status: existing.status });
      }

      const conn = await Connection.create({ requesterId, receiverId });

      // Notify recipient in real-time
      const requester = await User.findOne({ userId: requesterId }, 'username avatarHue').lean();
      deliverToUser(receiverId, {
        type: 'CONNECTION_REQUEST',
        payload: { connectionId: conn._id, from: requester },
      });

      return res.status(201).json({ success: true });
    } catch (err) {
      console.error('connection request error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ── POST /connections/respond ─────────────────────────────────────
router.post(
  '/respond',
  authenticate,
  [
    body('connectionId').notEmpty(),
    body('action').isIn(['accept', 'reject']).withMessage('action must be accept or reject'),
  ],
  handleValidationErrors,
  async (req, res) => {
    const { connectionId, action } = req.body;
    const userId = req.user.userId;

    try {
      const conn = await Connection.findById(connectionId);
      if (!conn) return res.status(404).json({ error: 'Connection not found' });
      if (conn.receiverId !== userId) return res.status(403).json({ error: 'Forbidden' });
      if (conn.status !== 'pending') return res.status(409).json({ error: 'Already responded' });

      conn.status = action === 'accept' ? 'accepted' : 'rejected';
      await conn.save();

      if (action === 'accept') {
        // Notify the requester that request was accepted
        const accepter = await User.findOne({ userId }, 'username avatarHue publicKey').lean();
        deliverToUser(conn.requesterId, {
          type: 'CONNECTION_ACCEPTED',
          payload: { user: accepter },
        });
      }

      return res.json({ success: true, status: conn.status });
    } catch (err) {
      console.error('connection respond error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ── GET /connections — list accepted connections ───────────────────
router.get('/', authenticate, async (req, res) => {
  const userId = req.user.userId;
  try {
    const conns = await Connection.find({
      $or: [{ requesterId: userId }, { receiverId: userId }],
      status: 'accepted',
    }).lean();

    const peerIds = conns.map((c) => (c.requesterId === userId ? c.receiverId : c.requesterId));
    const users = await User.find({ userId: { $in: peerIds } }, 'userId username publicKey bio avatarHue').lean();

    return res.json(users);
  } catch (err) {
    console.error('list connections error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /connections/pending — incoming pending requests ──────────
router.get('/pending', authenticate, async (req, res) => {
  const userId = req.user.userId;
  try {
    const pending = await Connection.find({ receiverId: userId, status: 'pending' }).lean();
    const requesterIds = pending.map((c) => c.requesterId);
    const users = await User.find({ userId: { $in: requesterIds } }, 'userId username bio avatarHue').lean();

    const result = pending.map((c) => ({
      connectionId: c._id,
      createdAt: c.createdAt,
      from: users.find((u) => u.userId === c.requesterId) || { userId: c.requesterId },
    }));

    return res.json(result);
  } catch (err) {
    console.error('pending connections error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
