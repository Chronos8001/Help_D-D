import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { hashPassword, hashToken, newSessionToken, passwordProblem, roles, sessionDurationMs, verifyPassword } from './auth.js';

const validFaces = new Set([4, 6, 8, 10, 12, 20, 100]);
const validRollTypes = new Set(['attaque', 'dégâts', 'sauvegarde', 'compétence', 'initiative']);
const validAttributes = new Set(['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA']);
const characterStatFields = ['force', 'dexterite', 'constitution', 'intelligence', 'sagesse', 'charisme'];
const characterFields = `
  p.id, p.joueur_id, p.campagne_id, p.race_id, p.classe_id, p.nom, p.niveau, p.xp,
  p.force, p.dexterite, p.constitution, p.intelligence, p.sagesse, p.charisme,
  p.pv_max, p.pv_actuels, p.classe_armure, p.statut, p.cree_le, p.race_nom,
  p.classe_nom, p.campagne_nom, p.mod_force, p.mod_dexterite, p.mod_constitution,
  p.mod_intelligence, p.mod_sagesse, p.mod_charisme, p.de_vie
`;
const accountFields = `
  c.id, c.identifiant, c.role, c.joueur_id, c.actif, c.cree_le, j.pseudo
`;
const identifierPattern = /^[a-z0-9._-]{3,40}$/;

// Messages lisibles pour les contraintes que l'interface peut déclencher.
const constraintMessages = {
  comptes_identifiant_key: 'Cet identifiant est déjà pris.',
  comptes_joueur_id_key: 'Ce joueur a déjà un compte.',
  comptes_check: 'Un compte joueur ou MJ doit être relié à un joueur.',
  joueurs_pseudo_key: 'Ce pseudo est déjà utilisé.'
};

const maxLoginFailures = 10;
const loginWindowMs = 15 * 60 * 1000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function positiveId(value, label = 'identifiant') {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new HttpError(400, `${label} invalide.`);
  }
  return id;
}

function integer(value, label, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new HttpError(400, `${label} doit être un entier entre ${minimum} et ${maximum}.`);
  }
  return parsed;
}

function text(value, label, maximum) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maximum) {
    throw new HttpError(400, `${label} est obligatoire et ne peut pas dépasser ${maximum} caractères.`);
  }
  return value.trim();
}

function identifier(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!identifierPattern.test(normalized)) {
    throw new HttpError(400, 'L’identifiant doit faire 3 à 40 caractères : lettres, chiffres, point, tiret ou soulignement.');
  }
  return normalized;
}

function password(value) {
  const problem = passwordProblem(value);
  if (problem) throw new HttpError(400, problem);
  return value;
}

function jsonObject(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Le corps de la requête doit être un objet JSON.');
  }
  return body;
}

function characterInput(body) {
  const input = {
    joueurId: body.joueur_id === null || body.joueur_id === undefined || body.joueur_id === '' ?
      null : positiveId(body.joueur_id, 'Joueur'),
    campagneId: positiveId(body.campagne_id, 'Campagne'),
    raceId: positiveId(body.race_id, 'Race'),
    classeId: positiveId(body.classe_id, 'Classe'),
    nom: text(body.nom, 'Nom', 80),
    niveau: integer(body.niveau ?? 1, 'Niveau', 1, 20),
    xp: integer(body.xp ?? 0, 'XP', 0, 2_147_483_647),
    force: integer(body.force, 'Force', 1, 30),
    dexterite: integer(body.dexterite, 'Dextérité', 1, 30),
    constitution: integer(body.constitution, 'Constitution', 1, 30),
    intelligence: integer(body.intelligence, 'Intelligence', 1, 30),
    sagesse: integer(body.sagesse, 'Sagesse', 1, 30),
    charisme: integer(body.charisme, 'Charisme', 1, 30),
    pvMax: integer(body.pv_max, 'PV maximum', 1, 100_000),
    pvActuels: integer(body.pv_actuels, 'PV actuels', 0, 100_000),
    classeArmure: integer(body.classe_armure ?? 10, 'Classe d’armure', 1, 30)
  };
  if (input.pvActuels > input.pvMax) {
    throw new HttpError(400, 'Les PV actuels ne peuvent pas dépasser les PV maximums.');
  }
  return input;
}

function rollInput(body) {
  const characterId = positiveId(body.personnage_id, 'Personnage');
  const faces = integer(body.faces, 'Nombre de faces', 4, 100);
  if (!validFaces.has(faces)) throw new HttpError(400, 'Dé non pris en charge.');
  const type = text(body.type_jet, 'Type de jet', 12);
  if (!validRollTypes.has(type)) throw new HttpError(400, 'Type de jet non pris en charge.');
  const attribute = body.carac === undefined || body.carac === '' ?
    null : text(body.carac, 'Caractéristique', 3).toUpperCase();
  if (attribute !== null && !validAttributes.has(attribute)) {
    throw new HttpError(400, 'Caractéristique non prise en charge.');
  }
  return [characterId, faces, type, attribute];
}

function bearerToken(request) {
  return /^Bearer\s+(\S+)$/i.exec(request.get('authorization') || '')?.[1];
}

function requireAccount(request, _response, next) {
  if (!request.compte) {
    return next(new HttpError(401, request.sessionInvalid ? 'Session expirée, reconnecte-toi.' : 'Connexion requise.'));
  }
  return next();
}

function requireRole(...allowed) {
  return (request, response, next) => requireAccount(request, response, (error) => {
    if (error) return next(error);
    if (!allowed.includes(request.compte.role)) {
      return next(new HttpError(403, 'Ton compte n’a pas accès à cette action.'));
    }
    return next();
  });
}

function loginLimiter() {
  const failures = new Map();
  return {
    check(key) {
      const entry = failures.get(key);
      if (entry && entry.resetAt < Date.now()) failures.delete(key);
      if ((failures.get(key)?.count ?? 0) >= maxLoginFailures) {
        throw new HttpError(429, 'Trop de tentatives de connexion. Réessaie dans quelques minutes.');
      }
    },
    fail(key) {
      const entry = failures.get(key) ?? { count: 0, resetAt: Date.now() + loginWindowMs };
      entry.count += 1;
      failures.set(key, entry);
    },
    reset(key) {
      failures.delete(key);
    }
  };
}

export function createApp({ pool, frontendOrigin }) {
  const app = express();
  const limiter = loginLimiter();
  app.disable('x-powered-by');
  app.use(cors({
    origin: (requestOrigin, callback) => callback(null, requestOrigin === frontendOrigin)
  }));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(express.json({ limit: '16kb' }));

  // Charge le compte de la session si un jeton est fourni. Aucune requête sans jeton.
  app.use('/api', asyncRoute(async (request, _response, next) => {
    request.compte = null;
    const token = bearerToken(request);
    if (token) {
      request.tokenHash = hashToken(token);
      const result = await pool.query(
        `SELECT c.id, c.identifiant, c.role, c.joueur_id, j.pseudo
         FROM sessions AS s
         JOIN comptes AS c ON c.id = s.compte_id
         LEFT JOIN joueurs AS j ON j.id = c.joueur_id
         WHERE s.jeton_hash = $1 AND s.expire_le > now() AND c.actif`,
        [request.tokenHash]
      );
      request.compte = result.rows[0] ?? null;
      request.sessionInvalid = !request.compte;
    }
    next();
  }));

  // Un MJ ne gère que ses campagnes ; un admin les gère toutes.
  async function assertCampaignAccess(compte, campaignId) {
    const result = await pool.query('SELECT mj_id FROM campagnes WHERE id = $1', [campaignId]);
    if (result.rowCount === 0) throw new HttpError(404, 'Campagne introuvable.');
    if (compte.role !== 'admin' && result.rows[0].mj_id !== compte.joueur_id) {
      throw new HttpError(403, 'Cette campagne est menée par un autre MJ.');
    }
  }

  async function assertCharacterAccess(compte, characterId) {
    const result = await pool.query('SELECT campagne_id FROM vue_table_mj WHERE id = $1', [characterId]);
    if (result.rowCount === 0) throw new HttpError(404, 'Personnage introuvable.');
    await assertCampaignAccess(compte, result.rows[0].campagne_id);
  }

  app.get('/api/health', asyncRoute(async (_request, response) => {
    await pool.query('SELECT 1');
    response.json({ status: 'ok' });
  }));

  app.post('/api/auth/login', asyncRoute(async (request, response) => {
    const key = request.ip;
    limiter.check(key);
    const body = jsonObject(request.body);
    const login = typeof body.identifiant === 'string' ? body.identifiant.trim().toLowerCase() : '';
    const secret = typeof body.mot_de_passe === 'string' ? body.mot_de_passe : '';
    if (!login || !secret || secret.length > 200) {
      throw new HttpError(400, 'Identifiant et mot de passe obligatoires.');
    }
    const found = await pool.query(
      'SELECT id, mot_de_passe, actif FROM comptes WHERE identifiant = $1',
      [login]
    );
    const account = found.rows[0];
    const valid = await verifyPassword(secret, account?.mot_de_passe);
    if (!valid || !account.actif) {
      limiter.fail(key);
      throw new HttpError(401, 'Identifiant ou mot de passe incorrect.');
    }
    limiter.reset(key);

    await pool.query('DELETE FROM sessions WHERE expire_le < now()');
    const token = newSessionToken();
    await pool.query(
      'INSERT INTO sessions (jeton_hash, compte_id, expire_le) VALUES ($1, $2, $3)',
      [hashToken(token), account.id, new Date(Date.now() + sessionDurationMs)]
    );
    const profile = await pool.query(
      `SELECT ${accountFields} FROM comptes AS c LEFT JOIN joueurs AS j ON j.id = c.joueur_id WHERE c.id = $1`,
      [account.id]
    );
    response.json({ data: { token, compte: profile.rows[0] } });
  }));

  app.get('/api/auth/me', requireAccount, (request, response) => {
    response.json({ data: request.compte });
  });

  app.post('/api/auth/logout', requireAccount, asyncRoute(async (request, response) => {
    await pool.query('DELETE FROM sessions WHERE jeton_hash = $1', [request.tokenHash]);
    response.json({ data: null });
  }));

  app.get('/api/campaigns', asyncRoute(async (_request, response) => {
    const result = await pool.query(
      'SELECT id, nom, univers, mj_id, debut, active FROM campagnes ORDER BY active DESC, nom'
    );
    response.json({ data: result.rows });
  }));

  app.get('/api/references', asyncRoute(async (_request, response) => {
    const [players, races, classes] = await Promise.all([
      pool.query('SELECT id, pseudo FROM joueurs ORDER BY pseudo'),
      pool.query('SELECT id, nom, vitesse_m FROM races ORDER BY nom'),
      pool.query('SELECT id, nom, de_vie, carac_principale FROM classes ORDER BY nom')
    ]);
    response.json({ data: { joueurs: players.rows, races: races.rows, classes: classes.rows } });
  }));

  app.get('/api/characters', asyncRoute(async (request, response) => {
    const values = [];
    let filter = '';
    if (request.query.campagneId !== undefined) {
      values.push(positiveId(request.query.campagneId, 'Campagne'));
      filter = 'WHERE p.campagne_id = $1';
    }
    const result = await pool.query(
      `SELECT ${characterFields}, j.pseudo AS joueur_pseudo
       FROM vue_fiches_joueurs AS p
       LEFT JOIN joueurs AS j ON j.id = p.joueur_id
       ${filter}
       ORDER BY p.nom`,
      values
    );
    response.json({ data: result.rows });
  }));

  // Espace joueur : uniquement les fiches reliées au compte connecté.
  app.get('/api/me/characters', requireAccount, asyncRoute(async (request, response) => {
    if (!request.compte.joueur_id) return response.json({ data: [] });
    const result = await pool.query(
      `SELECT ${characterFields}, j.pseudo AS joueur_pseudo
       FROM vue_fiches_joueurs AS p
       LEFT JOIN joueurs AS j ON j.id = p.joueur_id
       WHERE p.joueur_id = $1
       ORDER BY p.nom`,
      [request.compte.joueur_id]
    );
    return response.json({ data: result.rows });
  }));

  // Les fiches des compagnons : joueurs des campagnes où ce compte a un personnage.
  app.get('/api/me/party', requireAccount, asyncRoute(async (request, response) => {
    if (!request.compte.joueur_id) return response.json({ data: [] });
    const result = await pool.query(
      `SELECT ${characterFields}, j.pseudo AS joueur_pseudo
       FROM vue_fiches_joueurs AS p
       LEFT JOIN joueurs AS j ON j.id = p.joueur_id
       WHERE p.campagne_id IN (SELECT campagne_id FROM vue_fiches_joueurs WHERE joueur_id = $1)
       ORDER BY p.campagne_nom, p.nom`,
      [request.compte.joueur_id]
    );
    return response.json({ data: result.rows });
  }));

  app.post('/api/me/rolls', requireAccount, asyncRoute(async (request, response) => {
    const roll = rollInput(jsonObject(request.body));
    const owned = await pool.query(
      'SELECT 1 FROM vue_fiches_joueurs WHERE id = $1 AND joueur_id = $2',
      [roll[0], request.compte.joueur_id]
    );
    if (owned.rowCount === 0) throw new HttpError(403, 'Ce personnage ne t’appartient pas.');
    const result = await pool.query('SELECT lancer_de($1, $2, $3, $4) AS total', roll);
    response.status(201).json({ data: { total: result.rows[0].total } });
  }));

  app.use('/api/gm', requireRole('mj', 'admin'));

  // Les personnages (PNJ compris) des campagnes menées par ce MJ ; toutes pour un admin.
  app.get('/api/gm/characters', asyncRoute(async (request, response) => {
    const scope = request.compte.role === 'admin' ? null : request.compte.joueur_id;
    const values = [scope];
    let filter = '';
    if (request.query.campagneId !== undefined) {
      values.push(positiveId(request.query.campagneId, 'Campagne'));
      filter = 'AND p.campagne_id = $2';
    }
    const result = await pool.query(
      `SELECT ${characterFields}, j.pseudo AS joueur_pseudo
       FROM vue_table_mj AS p
       JOIN campagnes AS ca ON ca.id = p.campagne_id
       LEFT JOIN joueurs AS j ON j.id = p.joueur_id
       WHERE ($1::int IS NULL OR ca.mj_id = $1)
       ${filter}
       ORDER BY p.nom`,
      values
    );
    response.json({ data: result.rows });
  }));

  app.post('/api/gm/characters', asyncRoute(async (request, response) => {
    const character = characterInput(jsonObject(request.body));
    await assertCampaignAccess(request.compte, character.campagneId);
    const values = [
      character.joueurId, character.campagneId, character.raceId, character.classeId,
      character.nom, character.niveau, character.xp, ...characterStatFields.map((key) => character[key]),
      character.pvMax, character.pvActuels, character.classeArmure
    ];
    const created = await pool.query(
      `INSERT INTO vue_table_mj (
         joueur_id, campagne_id, race_id, classe_id, nom, niveau, xp,
         force, dexterite, constitution, intelligence, sagesse, charisme,
         pv_max, pv_actuels, classe_armure
       ) VALUES (${values.map((_, index) => `$${index + 1}`).join(', ')})
       RETURNING id`,
      values
    );
    response.status(201).json({ data: { id: created.rows[0].id } });
  }));

  app.post('/api/gm/campaigns', asyncRoute(async (request, response) => {
    const body = jsonObject(request.body);
    const nom = text(body.nom, 'Nom de campagne', 100);
    const univers = text(body.univers, 'Univers', 60);
    // Un MJ ouvre toujours la campagne à son nom ; seul l'admin choisit le MJ.
    const mjId = request.compte.role === 'admin' ?
      positiveId(body.mj_id, 'Maître du jeu') : request.compte.joueur_id;
    const debut = body.debut;
    const parsedDate = typeof debut === 'string' ? new Date(`${debut}T00:00:00Z`) : null;
    if (!parsedDate || Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== debut) {
      throw new HttpError(400, 'La date de début doit être au format AAAA-MM-JJ.');
    }
    const result = await pool.query(
      `INSERT INTO campagnes (nom, univers, mj_id, debut)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nom, univers, mj_id, debut, active`,
      [nom, univers, mjId, debut]
    );
    response.status(201).json({ data: result.rows[0] });
  }));

  app.patch('/api/gm/campaigns/:id', asyncRoute(async (request, response) => {
    const id = positiveId(request.params.id, 'Campagne');
    const body = jsonObject(request.body);
    if (typeof body.active !== 'boolean') {
      throw new HttpError(400, 'Le champ active doit être un booléen.');
    }
    await assertCampaignAccess(request.compte, id);
    const result = await pool.query(
      'UPDATE campagnes SET active = $1 WHERE id = $2 RETURNING id, nom, univers, mj_id, debut, active',
      [body.active, id]
    );
    if (result.rowCount === 0) throw new HttpError(404, 'Campagne introuvable.');
    response.json({ data: result.rows[0] });
  }));

  app.post('/api/gm/characters/:id/pv', asyncRoute(async (request, response) => {
    const id = positiveId(request.params.id, 'Personnage');
    const body = jsonObject(request.body);
    const delta = integer(body.delta, 'Variation de PV', -100_000, 100_000);
    if (delta === 0) throw new HttpError(400, 'La variation de PV ne peut pas être nulle.');
    const motif = body.motif === undefined ? 'Modification depuis le Grimoire' :
      text(body.motif, 'Motif', 200);
    await assertCharacterAccess(request.compte, id);
    await pool.query('CALL modifier_pv($1, $2, $3)', [id, delta, motif]);
    const result = await pool.query(
      'SELECT id, pv_actuels, pv_max, statut FROM vue_table_mj WHERE id = $1',
      [id]
    );
    response.json({ data: result.rows[0] });
  }));

  app.post('/api/gm/campaigns/:id/xp', asyncRoute(async (request, response) => {
    const campaignId = positiveId(request.params.id, 'Campagne');
    const xp = integer(jsonObject(request.body).xp, 'XP à distribuer', 0, 2_147_483_647);
    await assertCampaignAccess(request.compte, campaignId);
    await pool.query('CALL distribuer_xp($1, $2)', [campaignId, xp]);
    response.json({ data: { campagne_id: campaignId, xp_distribue: xp } });
  }));

  app.post('/api/gm/rolls', asyncRoute(async (request, response) => {
    const roll = rollInput(jsonObject(request.body));
    await assertCharacterAccess(request.compte, roll[0]);
    const result = await pool.query('SELECT lancer_de($1, $2, $3, $4) AS total', roll);
    response.status(201).json({ data: { total: result.rows[0].total } });
  }));

  app.use('/api/admin', requireRole('admin'));

  app.get('/api/admin/accounts', asyncRoute(async (_request, response) => {
    const result = await pool.query(
      `SELECT ${accountFields} FROM comptes AS c LEFT JOIN joueurs AS j ON j.id = c.joueur_id
       ORDER BY c.role, c.identifiant`
    );
    response.json({ data: result.rows });
  }));

  app.post('/api/admin/accounts', asyncRoute(async (request, response) => {
    const body = jsonObject(request.body);
    const login = identifier(body.identifiant);
    const secret = password(body.mot_de_passe);
    if (!roles.includes(body.role)) throw new HttpError(400, 'Rôle inconnu.');
    const playerId = body.joueur_id === null || body.joueur_id === undefined || body.joueur_id === '' ?
      null : positiveId(body.joueur_id, 'Joueur');
    const newPseudo = playerId === null && body.nouveau_pseudo ? text(body.nouveau_pseudo, 'Pseudo', 40) : null;
    if (body.role !== 'admin' && playerId === null && newPseudo === null) {
      throw new HttpError(400, 'Un compte joueur ou MJ doit être relié à un joueur.');
    }
    // Une seule requête : le joueur éventuel et le compte sont créés ensemble ou pas du tout.
    const result = await pool.query(
      `WITH nouveau AS (
         INSERT INTO joueurs (pseudo) SELECT $5::varchar WHERE $5::varchar IS NOT NULL RETURNING id
       )
       INSERT INTO comptes (identifiant, mot_de_passe, role, joueur_id)
       VALUES ($1, $2, $3, COALESCE($4::int, (SELECT id FROM nouveau)))
       RETURNING id`,
      [login, await hashPassword(secret), body.role, playerId, newPseudo]
    );
    response.status(201).json({ data: { id: result.rows[0].id } });
  }));

  app.patch('/api/admin/accounts/:id', asyncRoute(async (request, response) => {
    const id = positiveId(request.params.id, 'Compte');
    const body = jsonObject(request.body);
    const changes = [];
    const values = [];
    if (body.role !== undefined) {
      if (!roles.includes(body.role)) throw new HttpError(400, 'Rôle inconnu.');
      if (id === request.compte.id && body.role !== 'admin') {
        throw new HttpError(400, 'Tu ne peux pas retirer tes propres droits admin.');
      }
      values.push(body.role);
      changes.push(`role = $${values.length}`);
    }
    if (body.actif !== undefined) {
      if (typeof body.actif !== 'boolean') throw new HttpError(400, 'Le champ actif doit être un booléen.');
      if (id === request.compte.id && !body.actif) {
        throw new HttpError(400, 'Tu ne peux pas désactiver ton propre compte.');
      }
      values.push(body.actif);
      changes.push(`actif = $${values.length}`);
    }
    if (body.mot_de_passe !== undefined) {
      values.push(await hashPassword(password(body.mot_de_passe)));
      changes.push(`mot_de_passe = $${values.length}`);
    }
    if (changes.length === 0) throw new HttpError(400, 'Aucune modification demandée.');
    values.push(id);
    const result = await pool.query(
      `UPDATE comptes SET ${changes.join(', ')} WHERE id = $${values.length} RETURNING id`,
      values
    );
    if (result.rowCount === 0) throw new HttpError(404, 'Compte introuvable.');
    // Les droits ont changé : on ferme les autres sessions de ce compte.
    await pool.query(
      'DELETE FROM sessions WHERE compte_id = $1 AND jeton_hash <> $2',
      [id, request.tokenHash]
    );
    response.json({ data: { id } });
  }));

  app.delete('/api/admin/accounts/:id', asyncRoute(async (request, response) => {
    const id = positiveId(request.params.id, 'Compte');
    if (id === request.compte.id) throw new HttpError(400, 'Tu ne peux pas supprimer ton propre compte.');
    const result = await pool.query('DELETE FROM comptes WHERE id = $1', [id]);
    if (result.rowCount === 0) throw new HttpError(404, 'Compte introuvable.');
    response.json({ data: { id } });
  }));

  app.use('/api', (_request, _response, next) => {
    next(new HttpError(404, 'Route API introuvable.'));
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof HttpError) {
      return response.status(error.status).json({ error: error.message });
    }
    if (error.type === 'entity.parse.failed') {
      return response.status(400).json({ error: 'Le corps de la requête doit être un JSON valide.' });
    }
    if (error.type === 'entity.too.large') {
      return response.status(413).json({ error: 'Le corps de la requête dépasse la taille autorisée.' });
    }
    if (constraintMessages[error.constraint]) {
      return response.status(400).json({ error: constraintMessages[error.constraint] });
    }
    if (error.code && (error.code.startsWith('23') || error.code === 'P0001' || error.code.startsWith('22'))) {
      return response.status(400).json({ error: error.message });
    }
    console.error('Erreur API :', error);
    return response.status(500).json({ error: 'Une erreur interne est survenue.' });
  });

  return app;
}
