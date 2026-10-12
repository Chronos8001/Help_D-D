# Grimoire · fiches de personnage Donjons & Dragons

Le Grimoire rassemble la base PostgreSQL du projet et une application web responsive pour consulter les campagnes et les personnages. Le MJ dispose aussi d’outils pour créer des campagnes et des fiches, ajuster les PV, distribuer de l’XP et lancer des dés.

## Lancer en local

Prérequis : Docker Desktop, Git Bash et Node.js 20 ou plus.

1. Démarrer PostgreSQL puis créer les tables et les données de démo :

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

3. Copier `.env.example` vers `.env`, puis remplacer le mot de passe de `DATABASE_URL` et `APP_MJ_TOKEN` par des secrets uniques.
4. Démarrer l’API dans un terminal PowerShell :

   ```powershell
   npm install
   npm start
   ```

5. Servir le site depuis un autre terminal PowerShell :

   ```powershell
   npx --yes http-server public -p 8080
   ```

   Ouvrir `http://localhost:8080`. `public/config.js` pointe par défaut vers l’API locale sur le port 3000. La clé MJ reste dans la session du navigateur jusqu’à sa fermeture ou à la déconnexion.

## Héberger sur Internet

Le site statique et l’API sont deux déploiements indépendants. Le serveur Node.js ne sert que l’API ; `public/` contient l’interface web.

1. Créer une base PostgreSQL managée et y exécuter `projet.sql`.
2. Exécuter `api-permissions.sql` avec un mot de passe fort fourni dans `GRIMOIRE_API_PASSWORD`. Utiliser ce mot de passe dans `DATABASE_URL`.
3. Déployer l’API avec le `Dockerfile`. Configurer `DATABASE_URL`, `DATABASE_SSL=true`, `APP_MJ_TOKEN` et `FRONTEND_ORIGIN` dans les secrets du service. `FRONTEND_ORIGIN` est l’origine HTTPS du site statique, sans chemin final.
4. Déployer `public/` chez un hébergeur de site statique. Modifier `public/config.js` pour pointer sur l’URL HTTPS de l’API, puis republier le site.
5. Transmettre `APP_MJ_TOKEN` uniquement au MJ. L’API n’autorise les requêtes navigateur que depuis l’origine configurée.

Ne pas utiliser les mots de passe d’exemple du `docker-compose.yml` en production et ne pas exposer directement PostgreSQL à Internet.

## Interface et API

Les visiteurs peuvent parcourir les campagnes et consulter les fiches des personnages joueurs. Les actions MJ nécessitent `APP_MJ_TOKEN` : créer des campagnes et des fiches, clôturer une campagne, ajuster les PV, distribuer de l’XP ou lancer des dés.

Il n’y a pas encore de comptes joueurs individuels : les fiches publiques utilisent la vue `vue_fiches_joueurs`. Les notes privées du MJ ne sont pas renvoyées par l’API. Les règles de PV, d’XP et de jets restent appliquées par PostgreSQL ; les requêtes de l’API sont paramétrées.

Toutes les réponses sont au format JSON. Les routes MJ exigent `Authorization: Bearer <APP_MJ_TOKEN>`.

| Méthode | Route | Accès | Action |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Vérifier l’accès à la base |
| `GET` | `/api/campaigns` | Public | Lister les campagnes |
| `GET` | `/api/references` | Public | Lister joueurs, races et classes |
| `GET` | `/api/characters?campagneId=1` | Public | Lister les fiches joueurs, filtre facultatif |
| `GET` | `/api/gm/characters` | MJ | Lister les personnages, PNJ inclus |
| `POST` | `/api/gm/characters` | MJ | Créer une fiche |
| `POST` | `/api/gm/campaigns` | MJ | Créer une campagne |
| `PATCH` | `/api/gm/campaigns/:id` | MJ | Modifier l’état d’une campagne |
| `POST` | `/api/gm/characters/:id/pv` | MJ | Ajuster les PV |
| `POST` | `/api/gm/campaigns/:id/xp` | MJ | Distribuer de l’XP |
| `POST` | `/api/gm/rolls` | MJ | Lancer un dé |

## Données et index

`projet.sql` initialise le schéma, les fonctions, les procédures, les triggers, les vues, les rôles et les index. Les données de démonstration comprennent 200 personnages et 500 000 jets de dés.

Deux index accélèrent la recherche des jets par personnage et par date (`idx_jets_personnage_date`) et celle des 20 naturels (`idx_jets_critiques`). `demo.sql` présente les vues et le trigger des jets interdits pour un personnage mort, ainsi que des mesures `EXPLAIN ANALYZE` avant/après indexation. Il supprime et recrée les deux index pendant la démonstration.

## Prototype Vite historique

Le dossier `web/` contient également une seconde interface React/Vite et le contrat envisagé pour son API dans `web/API.md`. Cette interface utilise d’autres routes (`/api/campagnes`, `/api/table`, `/api/action`) qui ne sont pas fournies par le serveur Express à la racine. Elle est donc indépendante et n’est pas prête à être déployée ; pour utiliser l’application fonctionnelle, suivre les étapes ci-dessus avec `public/` et le serveur Node.js.
