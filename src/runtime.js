import 'dotenv/config';
import pg from 'pg';
import { createApp } from './app.js';

const required = ['DATABASE_URL', 'FRONTEND_ORIGIN'];
const missing = required.filter((name) => !process.env[name]);

if (missing.length > 0) {
  throw new Error(`Configuration manquante : ${missing.join(', ')}`);
}

let frontendOrigin;
try {
  const parsedOrigin = new URL(process.env.FRONTEND_ORIGIN);
  if (!['https:', 'http:'].includes(parsedOrigin.protocol) || parsedOrigin.origin !== process.env.FRONTEND_ORIGIN) {
    throw new Error('FRONTEND_ORIGIN doit être une origine http(s) sans chemin.');
  }
  frontendOrigin = parsedOrigin.origin;
} catch (error) {
  throw new Error(`Configuration FRONTEND_ORIGIN invalide : ${error.message}`, { cause: error });
}

const { Pool } = pg;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  max: process.env.VERCEL ? 2 : 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

pool.on('error', (error) => {
  console.error('Erreur inattendue de connexion PostgreSQL :', error);
});

export const app = createApp({ pool, frontendOrigin });
