const form = document.querySelector('#login-form');
const errorNode = document.querySelector('#login-error');

if (new URLSearchParams(location.search).has('expiree')) {
  errorNode.textContent = 'Ta session a expiré, reconnecte-toi.';
}

// Déjà connecté : on file directement vers le Grimoire.
if (getToken()) {
  api('/api/auth/me').then(() => location.replace('/')).catch(() => saveToken(''));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  errorNode.textContent = '';
  try {
    const { token } = await api('/api/auth/login', {
      method: 'POST',
      body: Object.fromEntries(new FormData(form))
    });
    saveToken(token);
    location.replace('/');
  } catch (error) {
    errorNode.textContent = error.message;
    button.disabled = false;
  }
});
