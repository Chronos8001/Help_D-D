// Crée (ou remet à zéro) les comptes de démonstration listés dans le README.
//   npm run comptes-demo
// Leurs mots de passe sont publics : réservé à une base locale.
import 'dotenv/config';
import pg from 'pg';
import { hashPassword } from './auth.js';

const demoAccounts = [
  { identifiant: 'admin', motDePasse: 'grimoire-admin', role: 'admin', joueurId: null },
  { identifiant: 'elminster', motDePasse: 'grimoire-elminster', role: 'mj', joueurId: 1 },
  { identifiant: 'volo', motDePasse: 'grimoire-volo', role: 'mj', joueurId: 2 },
  { identifiant: 'brindille', motDePasse: 'grimoire-brindille', role: 'joueur', joueurId: 3 },
  { identifiant: 'kaelis', motDePasse: 'grimoire-kaelis', role: 'joueur', joueurId: 4 }
];

if (process.env.DATABASE_SSL === 'true' || process.env.NODE_ENV === 'production') {
  console.error('Comptes de démo refusés : leurs mots de passe sont publics, ils ne doivent exister qu’en local.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  for (const account of demoAccounts) {
    await client.query(
      `INSERT INTO comptes (identifiant, mot_de_passe, role, joueur_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (identifiant) DO UPDATE
         SET mot_de_passe = EXCLUDED.mot_de_passe, role = EXCLUDED.role,
             joueur_id = EXCLUDED.joueur_id, actif = true`,
      [account.identifiant, await hashPassword(account.motDePasse), account.role, account.joueurId]
    );
    console.log(`${account.identifiant} / ${account.motDePasse} (${account.role})`);
  }
} catch (error) {
  console.error(`Impossible de créer les comptes de démo : ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
