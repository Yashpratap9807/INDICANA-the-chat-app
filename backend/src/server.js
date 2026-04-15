'use strict';

require('dotenv').config();

const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./routes/auth');
const keysRoutes = require('./routes/keys');
const messagesRoutes = require('./routes/messages');
const searchRoutes = require('./routes/search');
const rtcRoutes = require('./routes/rtc');
const profilesRoutes = require('./routes/profiles');
const followsRoutes = require('./routes/follows');
const phoneRoutes = require('./routes/phone');
const sessionsRoutes = require('./routes/sessions');
const safetyRoutes = require('./routes/safety');
const { initWebSocketHub } = require('./websocket/hub');

// ─── Validate required env vars ───────────────────────────────────────────────

const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET', 'PORT'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌  Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// ─── Express setup ────────────────────────────────────────────────────────────

const app = express();
const corsOrigin = process.env.CORS_ORIGIN || '*';

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map((item) => item.trim()),
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/auth', authRoutes);
app.use('/keys', keysRoutes);
app.use('/messages', messagesRoutes);
app.use('/search', searchRoutes);
app.use('/rtc', rtcRoutes);
app.use('/profiles', profilesRoutes);
app.use('/follows', followsRoutes);
app.use('/phone', phoneRoutes);
app.use('/sessions', sessionsRoutes);
app.use('/safety', safetyRoutes);

app.get('/health', (_req, res) => res.json({ status: 'ok', project: 'INDICANA' }));

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── HTTP + WebSocket server ──────────────────────────────────────────────────

const server = http.createServer(app);
initWebSocketHub(server);

// ─── MongoDB connection ───────────────────────────────────────────────────────

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅  MongoDB connected');
    server.listen(process.env.PORT, () => {
      console.log(`🔒  INDICANA backend running on port ${process.env.PORT}`);
      console.log(`📡  WebSocket hub active at ws://localhost:${process.env.PORT}/ws`);
    });
  })
  .catch((err) => {
    console.error('❌  MongoDB connection failed:', err.message);
    process.exit(1);
  });

module.exports = app;
