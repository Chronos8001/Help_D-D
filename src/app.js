import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

const validFaces = new Set([4, 6, 8, 10, 12, 20, 100]);
const validRollTypes = new Set(['attaque', 'dégâts', 'sauvegarde', 'compétence', 'initiative']);
const validAttributes = new Set(['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA']);
const characterStatFields = ['force', 'dexterite', 'constitution', 'intelligence', 'sagesse', 'charisme'];
const characterFields = `
  id, joueur_id, campagne_id, race_id, classe_id, nom, niveau, xp,
  force, dexterite, constitution, intelligence, sagesse, charisme,
  pv_max, pv_actuels, classe_armure, statut, cree_le, race_nom,
  classe_nom, campagne_nom, mod_force, mod_dexterite, mod_constitution,
  mod_intelligence, mod_sagesse, mod_charisme, de_vie
`;

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

function requireMjToken(configuredToken) {
  return (request, response, next) => {
    const match = /^Bearer\s+(\S+)$/i.exec(request.get('authorization') || '');
    const suppliedToken = match?.[1];
    if (!configuredToken) {
      return next(new HttpError(503, 'Le mode MJ n’est pas configuré.'));
    }
    if (!suppliedToken) {
      return next(new HttpError(401, 'Clé MJ requise.'));
    }

    const expected = Buffer.from(configuredToken);
    const supplied = Buffer.from(suppliedToken);
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
      return next(new HttpError(401, 'Clé MJ invalide.'));
    }
    return next();
  };
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

export function createApp({ pool, mjToken, frontendOrigin }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({
    origin: (requestOrigin, callback) => callback(null, requestOrigin === frontendOrigin)
  }));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', asyncRoute(async (_request, response) => {
    await pool.query('SELECT 1');
    response.json({ status: 'ok' });
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

  const requireMj = requireMjToken(mjToken);
  app.use('/api/gm', requireMj);

  app.get('/api/gm/characters', asyncRoute(async (request, response) => {
    const values = [];
    let filter = '';
    if (request.query.campagneId !== undefined) {
      values.push(positiveId(request.query.campagneId, 'Campagne'));
      filter = 'WHERE p.campagne_id = $1';
    }
    const result = await pool.query(
      `SELECT ${characterFields}, j.pseudo AS joueur_pseudo
       FROM vue_table_mj AS p
       LEFT JOIN joueurs AS j ON j.id = p.joueur_id
       ${filter}
       ORDER BY p.nom`,
      values
    );
    response.json({ data: result.rows });
  }));

  app.post('/api/gm/characters', asyncRoute(async (request, response) => {
    const character = characterInput(jsonObject(request.body));
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
    const mjId = positiveId(body.mj_id, 'Maître du jeu');
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
    await pool.query('CALL distribuer_xp($1, $2)', [campaignId, xp]);
    response.json({ data: { campagne_id: campaignId, xp_distribue: xp } });
  }));

  app.post('/api/gm/rolls', asyncRoute(async (request, response) => {
    const body = jsonObject(request.body);
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
    const result = await pool.query(
      'SELECT lancer_de($1, $2, $3, $4) AS total',
      [characterId, faces, type, attribute]
    );
    response.status(201).json({ data: { total: result.rows[0].total } });
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
    if (error.code && (error.code.startsWith('23') || error.code === 'P0001' || error.code.startsWith('22'))) {
      return response.status(400).json({ error: error.message });
    }
    console.error('Erreur API :', error);
    return response.status(500).json({ error: 'Une erreur interne est survenue.' });
  });

  return app;
}
