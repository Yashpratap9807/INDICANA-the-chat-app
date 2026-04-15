/**
 * INDICANA App Router
 * Orchestrates screen transitions: auth → userList → chat pane.
 */

const App = (() => {
  const root = () => document.getElementById('root');

  function navigate(screen) {
    switch (screen) {
      case 'auth':
        API.disconnectWebSocket();
        root().innerHTML = AuthUI.render();
        break;

      case 'userList':
        root().innerHTML = UserListUI.render();
        UserListUI.load();
        API.connectWebSocket((frame) => ChatUI.onSocketEvent(frame));
        break;

      default:
        navigate('auth');
    }
  }

  async function logout() {
    try {
      if (Store.isLoggedIn()) {
        await API.logout();
      }
    } catch {
      // Clear the local session even if the network request fails.
    } finally {
      API.disconnectWebSocket();
      Store.clear();
      navigate('auth');
    }
  }

  function init() {
    if (Store.isLoggedIn()) {
      navigate('userList');
    } else {
      navigate('auth');
    }
  }

  return { navigate, logout, init };
})();

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());
