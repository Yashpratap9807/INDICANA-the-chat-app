const express = require('express');
const { body, param } = require('express-validator');
const Message = require('../models/Message');
const authenticate = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validate');
const {
  deliverToRecipient,
  deliverToSender,
  deliverStatusUpdate,
} = require('../websocket/hub');
const { isBlockedBetween } = require('../utils/blocks');

const router = express.Router();

const sendValidation = [
  body('receiverId').notEmpty().withMessage('receiverId is required'),
  body('clientId').trim().notEmpty().withMessage('clientId is required'),
  body('type').optional().isIn(['text', 'image']).withMessage('type must be text or image'),
  body('ciphertext').isBase64().withMessage('ciphertext must be Base64'),
  body('nonce')
    .isBase64()
    .withMessage('nonce must be Base64')
    .isLength({ min: 32, max: 32 })
    .withMessage('nonce must be exactly 32 Base64 chars (24 bytes)'),
];

router.post('/send', authenticate, sendValidation, handleValidationErrors, async (req, res) => {
  const {
    receiverId,
    clientId,
    ciphertext,
    nonce,
    type = 'text',
  } = req.body;
  const senderId = req.user.userId;

  if (senderId === receiverId) {
    return res.status(400).json({ error: 'Cannot send a message to yourself' });
  }

  try {
    if (await isBlockedBetween(senderId, receiverId)) {
      return res.status(403).json({ error: 'Messaging is unavailable for this conversation' });
    }

    const message = new Message({
      senderId,
      receiverId,
      clientId,
      type,
      ciphertext,
      nonce,
      timestamp: new Date(),
    });
    await message.save();

    const packet = {
      senderId,
      receiverId,
      clientId,
      type,
      ciphertext,
      nonce,
      timestamp: message.timestamp,
      deliveredAt: message.deliveredAt,
      seenAt: message.seenAt,
    };

    const deliveredNow = deliverToRecipient(receiverId, packet);
    deliverToSender(senderId, packet);

    if (deliveredNow) {
      message.deliveredAt = new Date();
      await message.save();
      deliverStatusUpdate(senderId, {
        receiverId,
        nonce: message.nonce,
        clientId: message.clientId,
        deliveredAt: message.deliveredAt,
        seenAt: message.seenAt,
      });
    }

    return res.status(201).json({
      success: true,
      timestamp: message.timestamp,
      nonce: message.nonce,
      clientId: message.clientId,
      deliveredAt: message.deliveredAt,
      seenAt: message.seenAt,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Duplicate nonce or clientId - message rejected' });
    }
    console.error('Send message error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/seen/:peerId',
  authenticate,
  [param('peerId').notEmpty().withMessage('peerId is required')],
  handleValidationErrors,
  async (req, res) => {
    const viewerId = req.user.userId;
    const peerId = req.params.peerId;

    try {
      if (await isBlockedBetween(viewerId, peerId)) {
        return res.status(403).json({ error: 'Messaging is unavailable for this conversation' });
      }

      const unseenMessages = await Message.find({
        senderId: peerId,
        receiverId: viewerId,
        seenAt: null,
      }).lean();

      if (!unseenMessages.length) {
        return res.json({ success: true, updated: 0 });
      }

      const seenAt = new Date();
      await Message.updateMany(
        {
          senderId: peerId,
          receiverId: viewerId,
          seenAt: null,
        },
        {
          $set: {
            deliveredAt: seenAt,
            seenAt,
          },
        }
      );

      unseenMessages.forEach((message) => {
        deliverStatusUpdate(peerId, {
          receiverId: viewerId,
          nonce: message.nonce,
          clientId: message.clientId,
          deliveredAt: seenAt,
          seenAt,
        });
      });

      return res.json({ success: true, updated: unseenMessages.length });
    } catch (err) {
      console.error('Mark seen error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

router.get(
  '/:user1/:user2',
  authenticate,
  [
    param('user1').notEmpty(),
    param('user2').notEmpty(),
  ],
  handleValidationErrors,
  async (req, res) => {
    const { user1, user2 } = req.params;
    const requesterId = req.user.userId;

    if (requesterId !== user1 && requesterId !== user2) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    try {
      if (await isBlockedBetween(user1, user2)) {
        return res.status(403).json({ error: 'Messaging is unavailable for this conversation' });
      }

      const messages = await Message.find({
        $or: [
          { senderId: user1, receiverId: user2 },
          { senderId: user2, receiverId: user1 },
        ],
      })
        .sort({ timestamp: 1 })
        .select('senderId receiverId clientId type ciphertext nonce timestamp deliveredAt seenAt -_id')
        .lean();

      return res.json(messages);
    } catch (err) {
      console.error('Fetch messages error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

module.exports = router;
