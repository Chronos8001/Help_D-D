import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';

const queries = [];
const pool = {
  async query(sql, values = []) {
    queries.push({ sql, values });
    if (sql.includes('SELECT lancer_de')) return { rows: [{ total: 17 }], rowCount: 1 };
    if (sql.includes('INSERT INTO vue_table_mj')) return { rows: [{ id: 42 }], rowCount: 1 };
    if (sql.includes('FROM vue_fiches_joueurs')) {
      return { rows: [{ id: 3, nom: 'Lyra' }], rowCount: 1 };
    }
    if (sql.includes('FROM vue_table_mj')) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 1 };
  }
};

const frontendOrigin = 'https://grimoire.example';
const server = createApp({ pool, mjToken: 'test-mj-token', frontendOrigin }).listen(0);
let baseUrl;

before(async () => {
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('public characters use the player-safe view and never select GM notes', async () => {
  const response = await fetch(`${baseUrl}/api/characters`);
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.data[0].nom, 'Lyra');
  assert.equal('notes_mj' in result.data[0], false);
  assert.match(queries.at(-1).sql, /vue_fiches_joueurs/);
  assert.doesNotMatch(queries.at(-1).sql, /notes_mj/);
});

test('GM endpoints reject requests without the shared key', async () => {
  const beforeCount = queries.length;
  const response = await fetch(`${baseUrl}/api/gm/characters`);
  const result = await response.json();

  assert.equal(response.status, 401);
  assert.equal(result.error, 'Clé MJ requise.');
  assert.equal(queries.length, beforeCount);
});

test('GM dice rolls invoke the database function with validated parameters', async () => {
  const response = await fetch(`${baseUrl}/api/gm/rolls`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-mj-token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ personnage_id: 8, faces: 20, type_jet: 'attaque', carac: 'FOR' })
  });
  const result = await response.json();

  assert.equal(response.status, 201);
  assert.deepEqual(result.data, { total: 17 });
  assert.deepEqual(queries.at(-1).values, [8, 20, 'attaque', 'FOR']);
});

test('invalid character input is rejected before reaching PostgreSQL', async () => {
  const beforeCount = queries.length;
  const response = await fetch(`${baseUrl}/api/gm/characters`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-mj-token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ nom: 'Fiche incomplète', pv_max: 4, pv_actuels: 5 })
  });
  const result = await response.json();

  assert.equal(response.status, 400);
  assert.match(result.error, /Campagne invalide/);
  assert.equal(queries.length, beforeCount);
});

test('valid character creation inserts only the approved ficha fields', async () => {
  const response = await fetch(`${baseUrl}/api/gm/characters`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-mj-token',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
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
    })
  });
  const result = await response.json();

  assert.equal(response.status, 201);
  assert.deepEqual(result.data, { id: 42 });
  assert.match(queries.at(-1).sql, /INSERT INTO vue_table_mj/);
  assert.doesNotMatch(queries.at(-1).sql, /notes_mj/);
  assert.equal(queries.at(-1).values.length, 16);
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

test('the API authorizes preflight requests for the MJ browser client', async () => {
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
