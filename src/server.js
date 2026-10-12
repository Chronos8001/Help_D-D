import 'dotenv/config';
import pg from 'pg';
import { createApp } from './app.js';

const { Pool } = pg;
const required = ['DATABASE_URL', 'APP_MJ_TOKEN', 'FRONTEND_ORIGIN'];
const missing = required.filter((name) => !process.env[name]);

if (process.env.APP_MJ_TOKEN && process.env.APP_MJ_TOKEN.length < 32) {
  missing.push('APP_MJ_TOKEN (32 caractères minimum)');
}

if (missing.length > 0) {
  console.error(`Configuration manquante : ${missing.join(', ')}`);
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

pool.on('error', (error) => {
  console.error('Erreur inattendue de connexion PostgreSQL :', error);
});

let frontendOrigin;
try {
  const parsedOrigin = new URL(process.env.FRONTEND_ORIGIN);
  if (!['https:', 'http:'].includes(parsedOrigin.protocol) || parsedOrigin.origin !== process.env.FRONTEND_ORIGIN) {
    throw new Error('FRONTEND_ORIGIN doit être une origine http(s) sans chemin.');
  }
  frontendOrigin = parsedOrigin.origin;
} catch (error) {
  console.error(`Configuration FRONTEND_ORIGIN invalide : ${error.message}`);
  process.exit(1);
}

const app = createApp({ pool, mjToken: process.env.APP_MJ_TOKEN, frontendOrigin });
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`Grimoire disponible sur le port ${port}`);
});

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
