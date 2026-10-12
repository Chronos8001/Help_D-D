# Grimoire · fiches de personnage Donjons & Dragons

Le Grimoire rassemble la base PostgreSQL du projet et une application web responsive pour consulter les campagnes et les personnages. Le MJ dispose aussi d’outils pour créer une campagne ou une fiche, ajuster les PV, distribuer de l’XP et lancer les dés.

## Lancer en local

Prérequis : Docker Compose et Node.js 20 ou plus.

1. Démarrer PostgreSQL puis créer les tables et les données de démo :

   ```sh
   docker compose up -d
   sh rejouer.sh
   ```

2. Créer le compte limité utilisé par l’API. Choisir un mot de passe long et le fournir à `psql` :

   ```sh
   docker compose cp api-permissions.sql db:/tmp/api-permissions.sql
   # PowerShell
   $env:GRIMOIRE_API_PASSWORD = "choisir-un-mot-de-passe-long"
   docker compose exec -e GRIMOIRE_API_PASSWORD -T db psql -U dnd -d projet -f /tmp/api-permissions.sql
   ```

   Utiliser le même mot de passe dans `DATABASE_URL`. Relancer cette étape après `sh rejouer.sh`, qui recrée la base. Le rôle API et ses permissions sont créés par `api-permissions.sql`.

3. Copier `.env.example` vers `.env`, puis remplacer le mot de passe de `DATABASE_URL` et `APP_MJ_TOKEN` par des secrets uniques. `APP_MJ_TOKEN` est la clé privée que le MJ saisira dans l’interface.

4. Pour lancer l’API en local, démarrer le serveur :

   ```sh
   npm install
   npm start
   ```

   L’API répond sur [http://localhost:3000](http://localhost:3000). Servir séparément le dossier `public/` sur `http://localhost:8080` (par exemple `npx http-server public -p 8080`) et ouvrir cette adresse pour afficher le site. `public/config.js` pointe par défaut sur l’API locale. La clé MJ n’est jamais stockée dans le dépôt ; elle reste dans la session du navigateur jusqu’à sa fermeture ou à la déconnexion.

## Héberger l’application sur Internet

Le site statique et l’API sont deux déploiements indépendants et ont chacun leur adresse. Le serveur Node.js ne sert que l’API REST ; le dossier `public/` contient le site statique.

1. Créer une base PostgreSQL managée et exécuter `projet.sql` dessus. Le script de démonstration charge 500 000 jets de dés.
2. Exécuter `api-permissions.sql` avec un mot de passe fort fourni dans `GRIMOIRE_API_PASSWORD`. Utiliser ce même mot de passe dans `DATABASE_URL`.
3. Déployer le dépôt comme service web Docker avec le `Dockerfile`. Configurer les variables serveur `DATABASE_URL`, `DATABASE_SSL=true`, `APP_MJ_TOKEN` et `FRONTEND_ORIGIN`. `FRONTEND_ORIGIN` doit être l’origine HTTPS du site statique (par exemple `https://grimoire.example.com`), sans chemin final. Utiliser l’URL TLS fournie par la base.
4. Déployer le contenu de `public/` comme site statique chez un hébergeur web (par exemple un service Static Site). Dans `public/config.js`, remplacer `http://localhost:3000` par l’URL HTTPS de l’API (par exemple `https://grimoire-api.example.com`), puis republier le site.
5. Ouvrir l’adresse du site statique et transmettre `APP_MJ_TOKEN` uniquement au MJ. L’API n’autorise les requêtes du navigateur que depuis l’origine définie par `FRONTEND_ORIGIN`.

Ne pas utiliser les mots de passe d’exemple du `docker-compose.yml` en production, ni exposer directement le port PostgreSQL à Internet. La configuration du service doit fournir les secrets hors du dépôt.

## Interface et API

- Les visiteurs peuvent parcourir les campagnes actives ou terminées et consulter les fiches des personnages joueurs.
- Les actions MJ nécessitent la clé `APP_MJ_TOKEN`. Elles couvrent la création de campagnes et de personnages, l’activation/fermeture de campagnes, les ajustements de PV, la distribution d’XP et les jets de dés.
- Les joueurs ne disposent pas encore de comptes applicatifs individuels : la consultation des fiches joueurs est en lecture seule et utilise la vue `vue_fiches_joueurs`. Les fiches MJ utilisent `vue_table_mj`, mais l’API n’en sélectionne jamais la colonne `notes_mj`.
- Les règles de poids, de PV, de niveaux et de jets restent appliquées par PostgreSQL (triggers et procédures). L’API emploie des requêtes paramétrées et le rôle dédié décrit dans `api-permissions.sql`.

Les réponses utilisent du JSON sous la forme `{ "data": ... }` ; une erreur renvoie `{ "error": "..." }`. Les routes de gestion requièrent l’en-tête `Authorization: Bearer <APP_MJ_TOKEN>`. Les routes listées ci-dessous sont servies par l’adresse de l’API, séparée de celle du site.

| Méthode | Route | Accès | Action |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Vérifier l’accès à la base |
| `GET` | `/api/campaigns` | Public | Lister les campagnes |
| `GET` | `/api/references` | Public | Lister joueurs, races et classes |
| `GET` | `/api/characters?campagneId=1` | Public | Lister les fiches joueurs, avec filtre facultatif |
| `GET` | `/api/gm/characters` | MJ | Lister les personnages, PNJ inclus |
| `POST` | `/api/gm/characters` | MJ | Créer une fiche |
| `POST` | `/api/gm/campaigns` | MJ | Créer une campagne |
| `PATCH` | `/api/gm/campaigns/:id` | MJ | Modifier son état `{ "active": false }` |
| `POST` | `/api/gm/characters/:id/pv` | MJ | Ajuster les PV `{ "delta": -5, "motif": "Gobelin" }` |
| `POST` | `/api/gm/campaigns/:id/xp` | MJ | Distribuer `{ "xp": 100 }` à la campagne |
| `POST` | `/api/gm/rolls` | MJ | Lancer un dé `{ "personnage_id": 1, "faces": 20, "type_jet": "attaque", "carac": "FOR" }` |

## La base de données

Le schéma gère les joueurs, campagnes, races, classes, personnages, objets, inventaires et historiques de jets et de PV. Le script `projet.sql` comprend également les fonctions et procédures métier, les triggers, les vues et les rôles PostgreSQL.

```sh
docker compose exec db psql -U dnd -d projet
```
