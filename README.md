# Grimoire · fiches de personnage Donjons & Dragons

Une base PostgreSQL qui gère les fiches de personnage d'une table de D&D 5e : joueurs, campagnes,
personnages, inventaire et jets de dés. Le maître du jeu mène la partie, les joueurs consultent les fiches.

**Groupe** : _Prénom Nom_ (tables et données) · _Prénom Nom_ (fonctions et triggers) ·
_Prénom Nom_ (vues et rôles) · _Prénom Nom_ (index et page web)

## Lancer le projet

```sh
docker compose up -d     # Postgres 16 sur le port 5433
sh rejouer.sh            # repart d'une base vide et exécute projet.sql
docker compose exec db psql -U dnd -d projet
```

Avec le conteneur du festival, suivez la recette du sujet en copiant `projet.sql`.

---

## Les données

**Ce qu'elles contiennent** : 8 tables. `joueurs`, `campagnes`, `races`, `classes` et `objets` sont les tables
de référence. `personnages` est la fiche. `inventaire` relie personnages et objets. `jets_de_des` et
`journal_pv` gardent l'historique. 200 personnages (dont un PNJ et un mort pour les démos) et
**500 000 jets de dés** sont générés avec `generate_series`.

**Pourquoi** : les jets de dés sont la table qui grossit vraiment pendant une partie, c'est donc elle
qui sert aux mesures d'index. Les PV et l'XP générés suivent les règles D&D 5e (dé de vie + mod(CON)),
les fiches sont donc cohérentes.

**La preuve** : `SELECT count(*) FROM jets_de_des;` → 500 000.
`SELECT nom, statut, pv_actuels, pv_max FROM personnages WHERE campagne_id = 1;` → le groupe de démo.

## Fonctions et procédures

_À rédiger par le membre 2 : ce qu'il fait / pourquoi il est là / la preuve._

## Triggers

_À rédiger par le membre 2. Pour chaque trigger, dire pourquoi la règle est dans la base plutôt que dans l'application._

## Vues

_À rédiger par le membre 3 : ce que chaque vue montre, et ce qu'elle cache._

## Rôles

_À rédiger par le membre 3 : pour chaque rôle, une action autorisée et une action refusée._

## Index

_À rédiger par le membre 4 : la requête, le plan et le temps avant, puis après._

## Page Vercel

_À rédiger par le membre 4 : lien, et comment la page n'utilise que le rôle `maitre_du_jeu`._
