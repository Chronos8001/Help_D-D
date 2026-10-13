import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { hashPassword, hashToken } from '../src/auth.js';

// Comptes de test : MJ de la campagne 1 (joueur 1), joueur 5 qui possède le personnage 8, admin.
const sessions = new Map([
  [hashToken('jeton-mj'), { id: 1, identifiant: 'elminster', role: 'mj', joueur_id: 1, pseudo: 'Elminster' }],
  [hashToken('jeton-joueur'), { id: 2, identifiant: 'pip', role: 'joueur', joueur_id: 5, pseudo: 'Pip' }],
  [hashToken('jeton-admin'), { id: 3, identifiant: 'admin', role: 'admin', joueur_id: null, pseudo: null }]
]);
const campaignMj = { 1: 1, 2: 2 };
const characterCampaign = { 8: 1, 9: 2 };
let elminsterHash;

const queries = [];
const pool = {
  async query(sql, values = []) {
    queries.push({ sql, values });
    if (sql.includes('FROM sessions AS s')) {
      const account = sessions.get(values[0]);
      return { rows: account ? [account] : [], rowCount: account ? 1 : 0 };
    }
    if (sql.includes('FROM comptes WHERE identifiant')) {
      return values[0] === 'elminster' ?
        { rows: [{ id: 1, mot_de_passe: elminsterHash, actif: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (sql.includes('SELECT mj_id FROM campagnes')) {
      const mjId = campaignMj[values[0]];
      return { rows: mjId ? [{ mj_id: mjId }] : [], rowCount: mjId ? 1 : 0 };
    }
    if (sql.includes('SELECT campagne_id FROM vue_table_mj')) {
      const campaignId = characterCampaign[values[0]];
      return { rows: campaignId ? [{ campagne_id: campaignId }] : [], rowCount: campaignId ? 1 : 0 };
    }
    if (sql.includes('SELECT 1 FROM vue_fiches_joueurs')) {
      const owned = values[0] === 8 && values[1] === 5;
      return { rows: owned ? [{}] : [], rowCount: owned ? 1 : 0 };
    }
    if (sql.includes('SELECT lancer_de')) return { rows: [{ total: 17 }], rowCount: 1 };
    if (sql.includes('INSERT INTO vue_table_mj')) return { rows: [{ id: 42 }], rowCount: 1 };
    if (sql.includes('INSERT INTO comptes')) return { rows: [{ id: 7 }], rowCount: 1 };
    if (sql.includes('FROM vue_fiches_joueurs')) {
      return { rows: [{ id: 3, nom: 'Lyra' }], rowCount: 1 };
    }
    if (sql.includes('FROM comptes AS c')) {
      return { rows: [{ id: 1, identifiant: 'elminster', role: 'mj', joueur_id: 1 }], rowCount: 1 };
    }
    if (sql.includes('FROM vue_table_mj')) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 1 };
  }
};

const frontendOrigin = 'https://grimoire.example';
const server = createApp({ pool, frontendOrigin }).listen(0);
let baseUrl;

function call(path, { token, method = 'GET', body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

before(async () => {
  if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
  elminsterHash = await hashPassword('un-mot-de-passe-solide');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('public characters use the player-safe view and never select GM notes', async () => {
  const response = await call('/api/characters');
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.data[0].nom, 'Lyra');
  assert.equal('notes_mj' in result.data[0], false);
  assert.match(queries.at(-1).sql, /vue_fiches_joueurs/);
  assert.doesNotMatch(queries.at(-1).sql, /notes_mj/);
});

test('GM endpoints reject anonymous requests without touching the database', async () => {
  const beforeCount = queries.length;
  const response = await call('/api/gm/characters');
  const result = await response.json();

  assert.equal(response.status, 401);
  assert.equal(result.error, 'Connexion requise.');
  assert.equal(queries.length, beforeCount);
});

test('login returns a session token for valid credentials and stores only its hash', async () => {
  const response = await call('/api/auth/login', {
    method: 'POST', body: { identifiant: 'Elminster', mot_de_passe: 'un-mot-de-passe-solide' }
  });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.data.compte.role, 'mj');
  const insert = queries.find((query) => query.sql.includes('INSERT INTO sessions'));
  assert.equal(insert.values[0], hashToken(result.data.token));
  assert.notEqual(insert.values[0], result.data.token);
});

test('login rejects a wrong password and an unknown account with the same message', async () => {
  const wrong = await call('/api/auth/login', {
    method: 'POST', body: { identifiant: 'elminster', mot_de_passe: 'mauvais-mot-de-passe' }
  });
  const unknown = await call('/api/auth/login', {
    method: 'POST', body: { identifiant: 'personne', mot_de_passe: 'mauvais-mot-de-passe' }
  });

  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await wrong.json(), await unknown.json());
});

test('an unknown session token is reported as expired', async () => {
  const response = await call('/api/auth/me', { token: 'jeton-inconnu' });

  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /Session expirée/);
});

test('players cannot use GM tools', async () => {
  const response = await call('/api/gm/characters', { token: 'jeton-joueur' });

  assert.equal(response.status, 403);
});

test('players roll dice only for their own characters', async () => {
  const roll = { faces: 20, type_jet: 'attaque', carac: 'FOR' };
  const own = await call('/api/me/rolls', { token: 'jeton-joueur', method: 'POST', body: { ...roll, personnage_id: 8 } });
  const other = await call('/api/me/rolls', { token: 'jeton-joueur', method: 'POST', body: { ...roll, personnage_id: 9 } });

  assert.equal(own.status, 201);
  assert.deepEqual((await own.json()).data, { total: 17 });
  assert.equal(other.status, 403);
});

test('GM dice rolls invoke the database function with validated parameters', async () => {
  const response = await call('/api/gm/rolls', {
    token: 'jeton-mj',
    method: 'POST',
    body: { personnage_id: 8, faces: 20, type_jet: 'attaque', carac: 'FOR' }
  });
  const result = await response.json();

  assert.equal(response.status, 201);
  assert.deepEqual(result.data, { total: 17 });
  assert.deepEqual(queries.at(-1).values, [8, 20, 'attaque', 'FOR']);
});

test('a GM cannot act on a campaign run by another GM, an admin can', async () => {
  const asMj = await call('/api/gm/campaigns/2/xp', { token: 'jeton-mj', method: 'POST', body: { xp: 100 } });
  const asAdmin = await call('/api/gm/campaigns/2/xp', { token: 'jeton-admin', method: 'POST', body: { xp: 100 } });
  const hp = await call('/api/gm/characters/9/pv', { token: 'jeton-mj', method: 'POST', body: { delta: -3 } });

  assert.equal(asMj.status, 403);
  assert.equal(asAdmin.status, 200);
  assert.equal(hp.status, 403);
});

test('a GM always opens campaigns under their own name', async () => {
  const response = await call('/api/gm/campaigns', {
    token: 'jeton-mj',
    method: 'POST',
    body: { nom: 'Nouvelle', univers: 'Eberron', mj_id: 2, debut: '2026-10-13' }
  });

  assert.equal(response.status, 201);
  assert.equal(queries.at(-1).values[2], 1);
});

test('invalid character input is rejected before reaching PostgreSQL', async () => {
  const beforeCount = queries.length;
  const response = await call('/api/gm/characters', {
    token: 'jeton-mj', method: 'POST', body: { nom: 'Fiche incomplète', pv_max: 4, pv_actuels: 5 }
  });
  const result = await response.json();

  assert.equal(response.status, 400);
  assert.match(result.error, /Campagne invalide/);
  // Seule la recherche de session a été faite.
  assert.equal(queries.length, beforeCount + 1);
});

test('valid character creation inserts only the approved fiche fields', async () => {
  const response = await call('/api/gm/characters', {
    token: 'jeton-mj',
    method: 'POST',
    body: {
      joueur_id: null,
      campagne_id: 1,
      race_id: 2,
      classe_id: 3,
      nom: 'Ariane',
      niveau: 1,
      xp: 0,
      force: 10,
      dexterite: 14,
      constitution: 12,
      intelligence: 13,
      sagesse: 11,
      charisme: 15,
      pv_max: 9,
      pv_actuels: 9,
      classe_armure: 12
    }
  });
  const result = await response.json();

  assert.equal(response.status, 201);
  assert.deepEqual(result.data, { id: 42 });
  assert.match(queries.at(-1).sql, /INSERT INTO vue_table_mj/);
  assert.doesNotMatch(queries.at(-1).sql, /notes_mj/);
  assert.equal(queries.at(-1).values.length, 16);
});

test('only admins manage accounts, and passwords are stored hashed', async () => {
  const body = { identifiant: 'Nouveau', mot_de_passe: 'mot-de-passe-long', role: 'joueur', nouveau_pseudo: 'Nouveau' };
  const asMj = await call('/api/admin/accounts', { token: 'jeton-mj', method: 'POST', body });
  const asAdmin = await call('/api/admin/accounts', { token: 'jeton-admin', method: 'POST', body });

  assert.equal(asMj.status, 403);
  assert.equal(asAdmin.status, 201);
  const [login, stored] = queries.at(-1).values;
  assert.equal(login, 'nouveau');
  assert.match(stored, /^scrypt\$/);
  assert.doesNotMatch(stored, /mot-de-passe-long/);
});

test('an admin cannot remove their own admin rights', async () => {
  const response = await call('/api/admin/accounts/3', { token: 'jeton-admin', method: 'PATCH', body: { role: 'mj' } });

  assert.equal(response.status, 400);
});

test('the API permits cross-origin requests from the configured web address only', async () => {
  const allowed = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: frontendOrigin }
  });
  const rejected = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: 'https://evil.example' }
  });

  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), frontendOrigin);
  assert.equal(rejected.status, 200);
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
});

test('the API authorizes preflight requests for the browser client', async () => {
  const response = await fetch(`${baseUrl}/api/gm/characters`, {
    method: 'OPTIONS',
    headers: {
      Origin: frontendOrigin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type'
    }
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), frontendOrigin);
  assert.match(response.headers.get('access-control-allow-headers'), /authorization/i);
});

test('the API server does not also serve the web interface', async () => {
  const response = await fetch(baseUrl);

  assert.equal(response.status, 404);
});
