const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
window.GRIMOIRE_API_URL = localHosts.has(window.location.hostname) ?
  'http://localhost:3000' :
  'https://help-d-d-api.vercel.app';
