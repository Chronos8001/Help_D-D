// Partagé par login.html et index.html : jeton de session et appels à l'API.
const apiBaseUrl = (window.GRIMOIRE_API_URL || '').replace(/\/+$/, '');
const sessionKey = 'grimoire-session';

function getToken() {
  try {
    return sessionStorage.getItem(sessionKey) || '';
  } catch {
    return '';
  }
}

function saveToken(token) {
  try {
    if (token) sessionStorage.setItem(sessionKey, token);
    else sessionStorage.removeItem(sessionKey);
  } catch {
    // Stockage indisponible (navigation privée stricte) : la session durera le temps de la page.
  }
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json();
  if (response.status === 401 && token) {
    // Session expirée ou fermée par un admin : retour à la page de connexion.
    saveToken('');
    location.replace('/login.html?expiree=1');
  }
  if (!response.ok) throw new Error(result.error || 'La requête a échoué.');
  return result.data;
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}
