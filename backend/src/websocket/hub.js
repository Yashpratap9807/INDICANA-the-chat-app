/**
 * INDICANA WebSocket Hub
 *
 * Routes encrypted message packets and WebRTC call signaling frames.
 * The hub never inspects message plaintext.
 */

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const DeviceSession = require('../models/DeviceSession');

// Map: userId -> Set<WebSocket>
const clients = new Map();

function initWebSocketHub(httpServer) {
  const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

  wss.on('connection', async (socket, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    let user;
    try {
      user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      socket.close(4001, 'Unauthorized');
      return;
    }

    if (user.sessionId) {
      try {
        const session = await DeviceSession.findOne({
          sessionId: user.sessionId,
          userId: user.userId,
          revokedAt: null,
        }).lean();

        if (!session) {
          socket.close(4001, 'Session revoked');
          return;
        }
      } catch {
        socket.close(1011, 'Session check failed');
        return;
      }
    }

    const { userId } = user;
    const bucket = clients.get(userId) || new Set();
    bucket.add(socket);
    clients.set(userId, bucket);

    socket.on('message', (raw) => {
      let frame;
      try {
        frame = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (frame.type === 'CALL_SIGNAL' && typeof frame.to === 'string' && frame.payload) {
        deliverToUser(frame.to, {
          type: 'CALL_SIGNAL',
          payload: {
            from: userId,
            ...frame.payload,
          },
        });
      }
    });

    socket.on('close', () => removeClient(userId, socket));
    socket.on('error', () => removeClient(userId, socket));
  });

  return wss;
}

function deliverToRecipient(receiverId, packet) {
  return deliverToUser(receiverId, { type: 'NEW_MESSAGE', payload: packet });
}

function deliverToSender(senderId, packet) {
  return deliverToUser(senderId, { type: 'MESSAGE_SENT', payload: packet });
}

function deliverStatusUpdate(userId, payload) {
  return deliverToUser(userId, { type: 'MESSAGE_STATUS_UPDATE', payload });
}

function deliverToUser(userId, frame) {
  const sockets = clients.get(userId);
  if (!sockets) return false;

  let delivered = false;
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(frame));
      delivered = true;
    }
  }

  return delivered;
}

function removeClient(userId, socket) {
  const sockets = clients.get(userId);
  if (!sockets) return;

  sockets.delete(socket);
  if (!sockets.size) {
    clients.delete(userId);
  }
}

module.exports = {
  initWebSocketHub,
  deliverToRecipient,
  deliverToSender,
  deliverStatusUpdate,
  deliverToUser,
};
