# Grimoire · fiches de personnage Donjons & Dragons

Le Grimoire rassemble la base PostgreSQL du projet et une application web responsive pour consulter les campagnes et les personnages. Chacun se connecte avec son compte : les joueurs retrouvent leurs fiches et lancent leurs dés, les MJ gèrent leurs campagnes (fiches, PV, XP, dés) et les administrateurs gèrent les comptes.

## Comptes de démo

Pour une base locale, `npm run comptes-demo` crée ces comptes (ou remet leur mot de passe à zéro) :

| Identifiant | Mot de passe | Rôle | Ce qu’il voit |
| --- | --- | --- | --- |
| `admin` | `grimoire-admin` | Admin | Toutes les campagnes et la gestion des comptes |
| `elminster` | `grimoire-elminster` | MJ | La Mine perdue de Phandelver, le Tombeau de l’Annihilation |
| `volo` | `grimoire-volo` | MJ | La Malédiction de Strahd, les Voyages vers Eberron |
| `brindille` | `grimoire-brindille` | Joueur | Thorin (et Grok, mort) dans la Mine perdue |
| `kaelis` | `grimoire-kaelis` | Joueur | Lyra dans la Mine perdue |

Ces mots de passe sont publics : ne jamais créer ces comptes sur une base hébergée. Le script refuse de s’exécuter si `DATABASE_SSL=true` ou `NODE_ENV=production`.

## Lancer en local

Prérequis : Docker Desktop, Git Bash et Node.js 20 ou plus.

1. Démarrer PostgreSQL puis créer les tables, les données de démo et les tables de comptes (`comptes.sql`) :

   ```sh
   docker compose up -d
   sh rejouer.sh
   ```

2. Créer le compte PostgreSQL limité utilisé par l’API :

   ```powershell
   docker compose cp api-permissions.sql db:/tmp/api-permissions.sql
   $env:GRIMOIRE_API_PASSWORD = "choisir-un-mot-de-passe-long"
   docker compose exec -e GRIMOIRE_API_PASSWORD -T db psql -U dnd -d projet -f /tmp/api-permissions.sql
   ```

   Utiliser ce même mot de passe dans `DATABASE_URL`. Relancer cette étape après `sh rejouer.sh`, qui recrée la base.

3. Copier `.env.example` vers `.env`, puis remplacer le mot de passe de `DATABASE_URL`.
4. Installer les dépendances puis créer les [comptes de démo](#comptes-de-démo) :

   ```powershell
   npm install
   npm run comptes-demo
   ```

   Relancer `npm run comptes-demo` après `sh rejouer.sh`, qui efface aussi les comptes. Pour créer un compte avec son propre mot de passe (demandé au clavier, 10 caractères minimum), utiliser `npm run compte -- <identifiant> <joueur|mj|admin> [joueur_id]`. Relancée sur un identifiant existant, cette commande réinitialise son mot de passe. Un admin peut aussi créer des comptes depuis le site.
5. Démarrer l’API dans un terminal PowerShell :

   ```powershell
   npm start
   ```

6. Servir le site depuis un autre terminal PowerShell :

   ```powershell
   npx --yes http-server public -p 8080
   ```

   Ouvrir `http://localhost:8080` : sans session, le site redirige vers la page de connexion (`login.html`). `public/config.js` pointe par défaut vers l’API locale sur le port 3000. La session dure 12 heures et reste dans l’onglet jusqu’à sa fermeture ou à la déconnexion. Si le port 8080 est déjà pris, utiliser un autre port et l’indiquer dans `FRONTEND_ORIGIN`.

## Héberger sur Internet

Le site statique et l’API sont deux déploiements indépendants. Le serveur Node.js ne sert que l’API ; `public/` contient l’interface web.

1. Créer une base PostgreSQL managée et y exécuter `projet.sql` puis `comptes.sql`.
2. Exécuter `api-permissions.sql` avec un mot de passe fort fourni dans `GRIMOIRE_API_PASSWORD`. Utiliser ce mot de passe dans `DATABASE_URL`.
3. Déployer l’API avec le `Dockerfile`. Configurer `DATABASE_URL`, `DATABASE_SSL=true` et `FRONTEND_ORIGIN` dans les secrets du service. `FRONTEND_ORIGIN` est l’origine HTTPS du site statique, sans chemin final.
4. Déployer `public/` chez un hébergeur de site statique. Modifier `public/config.js` pour pointer sur l’URL HTTPS de l’API, puis republier le site.
5. Créer le premier admin avec `npm run compte -- <identifiant> admin` (jamais `npm run comptes-demo`), lancé avec la même `DATABASE_URL`. L’API n’autorise les requêtes navigateur que depuis l’origine configurée.

Ne pas utiliser les mots de passe d’exemple du `docker-compose.yml` en production et ne pas exposer directement PostgreSQL à Internet.

## Interface et API

Le site exige une connexion (`login.html`). Une fois connecté, chacun ne voit que les onglets de son rôle :

| Rôle | Ce qu’il peut faire |
| --- | --- |
| Joueur | « Mes personnages » : ses fiches et les jets de dés. « Mon groupe » : les personnages joueurs des campagnes où il joue. |
| MJ | « Mes campagnes » : uniquement **ses** campagnes (`campagnes.mj_id`), avec tous leurs personnages (PNJ compris) en liste compacte, les PV, l’XP, les dés et la clôture. « Créer » : nouvelles fiches et campagnes, toujours à son nom. Un MJ qui a ses propres personnages voit aussi les onglets joueur. |
| Admin | Les outils MJ sur toutes les campagnes, plus l’onglet « Comptes » : création (avec un joueur existant ou nouveau), changement de rôle, désactivation, nouveau mot de passe, suppression |

Les comptes sont dans `comptes.sql`, à part de `projet.sql`. Les mots de passe sont hachés avec scrypt. Chaque session est un jeton aléatoire dont seule l’empreinte SHA-256 est enregistrée en base. Changer le rôle, l’état ou le mot de passe d’un compte ferme ses autres sessions. Après 10 échecs de connexion en 15 minutes depuis la même adresse, l’API bloque les nouvelles tentatives.

Les fiches publiques utilisent la vue `vue_fiches_joueurs`. Les notes privées du MJ ne sont pas renvoyées par l’API. Les règles de PV, d’XP et de jets restent appliquées par PostgreSQL ; les requêtes de l’API sont paramétrées.

Toutes les réponses sont au format JSON. Les routes protégées exigent `Authorization: Bearer <jeton>`, où le jeton est renvoyé par `/api/auth/login`.

| Méthode | Route | Accès | Action |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Vérifier l’accès à la base |
| `POST` | `/api/auth/login` | Public | Se connecter (`identifiant`, `mot_de_passe`) |
| `GET` | `/api/auth/me` | Connecté | Lire le compte de la session |
| `POST` | `/api/auth/logout` | Connecté | Fermer la session |
| `GET` | `/api/campaigns` | Public | Lister les campagnes |
| `GET` | `/api/references` | Public | Lister joueurs, races et classes |
| `GET` | `/api/characters?campagneId=1` | Public | Lister les fiches joueurs, filtre facultatif |
| `GET` | `/api/me/characters` | Connecté | Lister ses propres fiches |
| `GET` | `/api/me/party` | Connecté | Lister les personnages joueurs de ses campagnes |
| `POST` | `/api/me/rolls` | Connecté | Lancer un dé pour un de ses personnages |
| `GET` | `/api/gm/characters` | MJ, admin | Lister les personnages (PNJ inclus) de ses campagnes, ou de toutes pour un admin |
| `POST` | `/api/gm/characters` | MJ, admin | Créer une fiche |
| `POST` | `/api/gm/campaigns` | MJ, admin | Créer une campagne |
| `PATCH` | `/api/gm/campaigns/:id` | MJ, admin | Modifier l’état d’une campagne |
| `POST` | `/api/gm/characters/:id/pv` | MJ, admin | Ajuster les PV |
| `POST` | `/api/gm/campaigns/:id/xp` | MJ, admin | Distribuer de l’XP |
| `POST` | `/api/gm/rolls` | MJ, admin | Lancer un dé |
| `GET` | `/api/admin/accounts` | Admin | Lister les comptes |
| `POST` | `/api/admin/accounts` | Admin | Créer un compte |
| `PATCH` | `/api/admin/accounts/:id` | Admin | Changer le rôle, l’état ou le mot de passe |
| `DELETE` | `/api/admin/accounts/:id` | Admin | Supprimer un compte |

## Données et index

`projet.sql` initialise le schéma, les fonctions, les procédures, les triggers, les vues, les rôles et les index. Les données de démonstration comprennent 4 campagnes de 4 personnages joueurs chacune, plus un PNJ et Grok, un personnage mort qui sert à la démo du trigger, ainsi que 500 000 jets de dés.

Deux index accélèrent la recherche des jets par personnage et par date (`idx_jets_personnage_date`) et celle des 20 naturels (`idx_jets_critiques`). `demo.sql` présente les vues et le trigger des jets interdits pour un personnage mort, ainsi que des mesures `EXPLAIN ANALYZE` avant/après indexation. Il supprime et recrée les deux index pendant la démonstration.

