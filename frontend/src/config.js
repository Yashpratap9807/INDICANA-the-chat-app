window.INDICANA_CONFIG = window.INDICANA_CONFIG || {};

(() => {
  const config = window.INDICANA_CONFIG;
  const isSecure = window.location.protocol === 'https:';
  const isFileApp = window.location.protocol === 'file:';
  const hostname = window.location.hostname || 'localhost';
  const fallbackApiBase = isFileApp
    ? 'https://your-backend-domain.com'
    : `${isSecure ? 'https' : 'http'}://${hostname}:3001`;
  const fallbackWsBase = isFileApp
    ? 'wss://your-backend-domain.com'
    : `${isSecure ? 'wss' : 'ws'}://${hostname}:3001`;

  if (!config.apiBase) {
    config.apiBase = fallbackApiBase;
  }

  if (!config.wsBase) {
    config.wsBase = fallbackWsBase;
  }
})();
