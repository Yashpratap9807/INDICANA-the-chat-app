/**
 * INDICANA API client
 */

const API = (() => {
  const BASE = window.INDICANA_CONFIG?.apiBase || 'http://localhost:3001';
  const WS_BASE = window.INDICANA_CONFIG?.wsBase || 'ws://localhost:3001';

  let socket = null;
  let onEvent = null;
  let reconnectTimer = null;
  let manualDisconnect = false;
  let rtcConfigCache = null;

  function authHeaders() {
    const session = Store.get();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.token}`,
    };
  }

  async function request(method, path, body) {
    const options = { method, headers: authHeaders() };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(BASE + path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    return data;
  }

  async function publicRequest(method, path, body) {
    const response = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    return data;
  }

  function register(username, password, publicKey, bio, phone) {
    return publicRequest('POST', '/auth/register', {
      username,
      password,
      publicKey,
      bio,
      phone,
    });
  }

  function login(username, password) {
    return publicRequest('POST', '/auth/login', { username, password });
  }

  function verifyLoginOtp(loginToken, otp) {
    return publicRequest('POST', '/auth/login/verify-otp', { loginToken, otp });
  }

  function requestPasswordReset(username) {
    return publicRequest('POST', '/auth/password/request-reset', { username });
  }

  function resetPassword(resetToken, otp, newPassword) {
    return publicRequest('POST', '/auth/password/reset', {
      resetToken,
      otp,
      newPassword,
    });
  }

  function logout() {
    return request('POST', '/auth/logout');
  }

  function listUsers() {
    return request('GET', '/keys/users');
  }

  function searchUsers(query) {
    return request('GET', `/search/users?q=${encodeURIComponent(query)}`);
  }

  function getPublicKey(userId) {
    return request('GET', `/keys/public-key/${userId}`);
  }

  function fetchMyProfile() {
    return request('GET', '/profiles/me');
  }

  function fetchProfile(userId) {
    return request('GET', `/profiles/${userId}`);
  }

  function updateMyProfile(payload) {
    return request('PATCH', '/profiles/me', payload);
  }

  function sendPhoneOtp(phone) {
    const session = Store.get();
    const headers = { 'Content-Type': 'application/json' };
    if (session?.token) {
      headers.Authorization = `Bearer ${session.token}`;
    }

    return fetch(`${BASE}/phone/send-otp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ phone }),
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      return data;
    });
  }

  function verifyPhoneOtp(phone, otp) {
    return request('POST', '/phone/verify', { phone, otp });
  }

  function listSessions() {
    return request('GET', '/sessions');
  }

  function revokeSession(sessionId) {
    return request('DELETE', `/sessions/${sessionId}`);
  }

  function revokeCurrentSession() {
    return request('DELETE', '/sessions/current');
  }

  function listBlockedUsers() {
    return request('GET', '/safety/blocks');
  }

  function blockUser(userId) {
    return request('POST', `/safety/blocks/${userId}`);
  }

  function unblockUser(userId) {
    return request('DELETE', `/safety/blocks/${userId}`);
  }

  function reportUser(targetUserId, reason) {
    return request('POST', '/safety/reports', { targetUserId, reason });
  }

  function followUser(userId) {
    return request('POST', `/follows/${userId}`);
  }

  function unfollowUser(userId) {
    return request('DELETE', `/follows/${userId}`);
  }

  function sendMessage(receiverId, clientId, ciphertext, nonce, type = 'text') {
    return request('POST', '/messages/send', {
      receiverId,
      clientId,
      ciphertext,
      nonce,
      type,
    });
  }

  function fetchMessages(user1, user2) {
    return request('GET', `/messages/${user1}/${user2}`);
  }

  function markConversationSeen(peerId) {
    return request('POST', `/messages/seen/${peerId}`);
  }

  function reactToMessage(peerId, nonce, emoji) {
    return request('POST', '/messages/react', {
      peerId,
      nonce,
      emoji,
    });
  }

  async function getRtcConfig() {
    if (!rtcConfigCache) {
      const config = await request('GET', '/rtc/config');
      rtcConfigCache = {
        iceServers: sanitizeIceServers(config.iceServers || []),
      };
    }
    return rtcConfigCache;
  }

  function sanitizeIceServers(iceServers) {
    return iceServers.filter((server) => {
      if (!server || !server.urls) return false;

      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      const validUrls = urls.filter(isValidIceUrl);
      if (!validUrls.length) return false;

      server.urls = Array.isArray(server.urls) ? validUrls : validUrls[0];
      return true;
    });
  }

  function isValidIceUrl(url) {
    if (typeof url !== 'string') return false;

    if (url.startsWith('stun:')) {
      return !url.includes('?');
    }

    if (url.startsWith('turn:') || url.startsWith('turns:')) {
      return true;
    }

    return false;
  }

  function connectWebSocket(callback) {
    const session = Store.get();
    if (!session) return;

    onEvent = callback;
    manualDisconnect = false;

    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    socket = new WebSocket(`${WS_BASE}/ws?token=${session.token}`);

    socket.addEventListener('message', (event) => {
      try {
        const frame = JSON.parse(event.data);
        if (onEvent) onEvent(frame);
      } catch {
        // Ignore malformed frames.
      }
    });

    socket.addEventListener('close', () => {
      socket = null;
      if (manualDisconnect || !Store.isLoggedIn()) return;

      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => connectWebSocket(onEvent), 3000);
    });
  }

  function disconnectWebSocket() {
    manualDisconnect = true;
    clearTimeout(reconnectTimer);
    if (socket) {
      socket.close();
      socket = null;
    }
  }

  function sendCallSignal(to, payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('Realtime connection is not ready yet');
    }

    socket.send(JSON.stringify({
      type: 'CALL_SIGNAL',
      to,
      payload,
    }));
  }

  function sendTypingSignal(to, isTyping) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(JSON.stringify({
      type: 'TYPING_SIGNAL',
      to,
      payload: {
        isTyping: Boolean(isTyping),
      },
    }));

    return true;
  }

  return {
    register,
    login,
    verifyLoginOtp,
    requestPasswordReset,
    resetPassword,
    logout,
    listUsers,
    searchUsers,
    getPublicKey,
    fetchMyProfile,
    fetchProfile,
    updateMyProfile,
    sendPhoneOtp,
    verifyPhoneOtp,
    listSessions,
    revokeSession,
    revokeCurrentSession,
    listBlockedUsers,
    blockUser,
    unblockUser,
    reportUser,
    followUser,
    unfollowUser,
    sendMessage,
    fetchMessages,
    markConversationSeen,
    reactToMessage,
    getRtcConfig,
    connectWebSocket,
    disconnectWebSocket,
    sendCallSignal,
    sendTypingSignal,
  };
})();
