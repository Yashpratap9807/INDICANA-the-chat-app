window.INDICANA_CONFIG = window.INDICANA_CONFIG || {};

(() => {
  const config = window.INDICANA_CONFIG;
  const hostname = window.location.hostname || 'localhost';
  const isSecure = window.location.protocol === 'https:';

  if (!config.apiBase) {
    config.apiBase = `${isSecure ? 'https' : 'http'}://${hostname}:3001`;
  }

  if (!config.wsBase) {
    config.wsBase = `${isSecure ? 'wss' : 'ws'}://${hostname}:3001`;
  }
})();
