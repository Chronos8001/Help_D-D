import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const keyLength = 64;
const scryptOptions = { N: 16384, r: 8, p: 1 };

export const roles = ['joueur', 'mj', 'admin'];
export const sessionDurationMs = 12 * 60 * 60 * 1000;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, keyLength, scryptOptions);
  const { N, r, p } = scryptOptions;
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

// Une empreinte factice sert quand l'identifiant est inconnu : la réponse prend
// le même temps, ce qui évite de révéler quels comptes existent.
const dummyHash = await hashPassword(crypto.randomBytes(16).toString('hex'));

export async function verifyPassword(password, stored = dummyHash) {
  const [scheme, N, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(N), r: Number(r), p: Number(p)
  });
  return crypto.timingSafeEqual(expected, actual);
}

export function newSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 10) {
    return 'Le mot de passe doit contenir au moins 10 caractères.';
  }
  if (password.length > 200) return 'Le mot de passe ne peut pas dépasser 200 caractères.';
  return null;
}
