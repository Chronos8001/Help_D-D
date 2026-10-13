// Crée un compte, ou réinitialise son mot de passe s'il existe déjà.
//   npm run compte -- <identifiant> <joueur|mj|admin> [joueur_id]
// Le mot de passe est lu dans GRIMOIRE_MOT_DE_PASSE, sinon demandé au clavier.
import 'dotenv/config';
import readline from 'node:readline/promises';
import pg from 'pg';
import { hashPassword, passwordProblem, roles } from './auth.js';

const [login, role, playerIdArgument] = process.argv.slice(2);
const playerId = playerIdArgument === undefined ? null : Number(playerIdArgument);

if (!login || !roles.includes(role) || (playerId !== null && !Number.isSafeInteger(playerId))) {
  console.error('Usage : npm run compte -- <identifiant> <joueur|mj|admin> [joueur_id]');
  process.exit(1);
}
if (role !== 'admin' && playerId === null) {
  console.error('Un compte joueur ou MJ doit être relié à un joueur : précise joueur_id.');
  process.exit(1);
}

let secret = process.env.GRIMOIRE_MOT_DE_PASSE;
if (!secret) {
  const input = readline.createInterface({ input: process.stdin, output: process.stdout });
  secret = await input.question('Mot de passe : ');
  input.close();
}
const problem = passwordProblem(secret);
if (problem) {
  console.error(problem);
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined
});
await client.connect();
try {
  const result = await client.query(
    `INSERT INTO comptes (identifiant, mot_de_passe, role, joueur_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (identifiant) DO UPDATE
       SET mot_de_passe = EXCLUDED.mot_de_passe, role = EXCLUDED.role,
           joueur_id = EXCLUDED.joueur_id, actif = true
     RETURNING id`,
    [login.trim().toLowerCase(), await hashPassword(secret), role, playerId]
  );
  console.log(`Compte « ${login.trim().toLowerCase()} » (${role}) prêt, id ${result.rows[0].id}.`);
} catch (error) {
  console.error(`Impossible de créer le compte : ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
