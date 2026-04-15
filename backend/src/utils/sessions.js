const DeviceSession = require('../models/DeviceSession');

function getClientIp(req) {
  return req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
}

function getDeviceName(req) {
  const agent = String(req.headers['user-agent'] || '').toLowerCase();
  if (!agent) return 'Browser session';

  const device = agent.includes('mobile') ? 'Mobile' : 'Desktop';

  if (agent.includes('edg')) return `${device} Edge`;
  if (agent.includes('chrome')) return `${device} Chrome`;
  if (agent.includes('firefox')) return `${device} Firefox`;
  if (agent.includes('safari') && !agent.includes('chrome')) return `${device} Safari`;

  return `${device} Browser`;
}

async function createSessionForRequest(req, userId) {
  const record = await DeviceSession.create({
    userId,
    deviceName: getDeviceName(req),
    userAgent: String(req.headers['user-agent'] || ''),
    ipAddress: String(getClientIp(req)),
    lastSeenAt: new Date(),
  });

  return record;
}

module.exports = {
  createSessionForRequest,
  getClientIp,
  getDeviceName,
};
