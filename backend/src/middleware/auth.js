const jwt = require('jsonwebtoken');
const DeviceSession = require('../models/DeviceSession');

/**
 * Express middleware that verifies the JWT in the Authorization header.
 * Attaches decoded payload as req.user = { userId, username }.
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.sessionId) {
      const session = await DeviceSession.findOne({
        sessionId: payload.sessionId,
        userId: payload.userId,
        revokedAt: null,
      }).lean();

      if (!session) {
        return res.status(401).json({ error: 'Session expired or revoked' });
      }

      DeviceSession.updateOne(
        { sessionId: payload.sessionId },
        { $set: { lastSeenAt: new Date() } }
      ).catch(() => {});
    }

    req.user = {
      userId: payload.userId,
      username: payload.username,
      sessionId: payload.sessionId || null,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authenticate;
