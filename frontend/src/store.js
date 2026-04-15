/**
 * INDICANA Store
 *
 * Session data and local encryption keys are stored separately so a user can
 * sign out without losing the private key tied to this device.
 */

const Store = (() => {
  const SESSION_KEY = 'indicana_session';
  const LOCAL_KEYS_KEY = 'indicana_local_keys';

  function get() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
    } catch {
      return null;
    }
  }

  function save(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function patch(updates) {
    const current = get() || {};
    save({ ...current, ...updates });
  }

  function clear() {
    localStorage.removeItem(SESSION_KEY);
  }

  function isLoggedIn() {
    const session = get();
    return !!(session && session.token && session.secretKey);
  }

  function saveLocalKey(userId, username, publicKey, secretKey) {
    const keys = getLocalKeys();
    const record = { userId, username, publicKey, secretKey };

    const withoutMatches = keys.filter((item) => item.userId !== userId && item.username !== username);
    withoutMatches.push(record);
    localStorage.setItem(LOCAL_KEYS_KEY, JSON.stringify(withoutMatches));
  }

  function getLocalKey(userId, username) {
    const keys = getLocalKeys();
    return keys.find((item) => item.userId === userId || item.username === username) || null;
  }

  function getLocalKeys() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEYS_KEY)) || [];
    } catch {
      return [];
    }
  }

  return {
    get,
    save,
    patch,
    clear,
    isLoggedIn,
    saveLocalKey,
    getLocalKey,
  };
})();
