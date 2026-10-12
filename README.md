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

`modificateur(score)` applique l'arrondi vers le bas de la règle D&D 5e : 10 donne 0, 16 donne +3 et 8 donne −1. `lancer_de(p_perso, p_faces, p_type, p_carac)` tire le dé, ajoute le modificateur de caractéristique si elle est fournie, enregistre le jet et renvoie le total.

`modifier_pv(p_perso, p_delta, p_motif)` centralise dégâts et soins. Les PV sont bornés entre 0 et `pv_max` ; à 0 le personnage est inconscient, sauf si les dégâts excédentaires atteignent `pv_max`, auquel cas il meurt. Un soin réveille un inconscient, mais soigner un mort renvoie une erreur. Chaque changement est transmis au trigger avec son motif.

La procédure bonus `distribuer_xp(p_campagne, p_xp)` ajoute l'XP aux personnages non morts de la campagne et applique les paliers D&D 5e jusqu'au niveau 20. Chaque niveau gagné augmente les PV maximums selon le dé de vie de la classe et le modificateur de Constitution.

Ces opérations sont `SECURITY DEFINER` : le MJ peut les appeler sans recevoir de droits directs sur les tables. Vérifications dans `psql` après `SET ROLE mj_elminster` :

```sql
SELECT modificateur(8), modificateur(10), modificateur(16); -- -1, 0, 3
SELECT lancer_de(1, 20, 'attaque', 'FOR');
CALL modifier_pv(1, -8, 'Gobelin');
SELECT personnage_id, ancien_pv, nouveau_pv, motif, auteur
FROM vue_mj_journal ORDER BY le DESC LIMIT 1;
```

## Triggers

Trois triggers appliquent des règles communes à tous les clients. `trg_verifier_charge` refuse un ajout ou une modification d'inventaire qui ferait dépasser Force × 7,5 kg, avec le poids porté et la limite dans l'erreur. `trg_interdire_jet_mort` bloque tout jet créé pour un personnage mort. `trg_journaliser_pv` écrit l'ancien et le nouveau total de PV, le motif et l'auteur à chaque changement effectif.

Ces règles vivent dans PostgreSQL plutôt que seulement dans l'application : `psql`, la page Vercel et un éventuel bot Discord passent ainsi par les mêmes contrôles. Les fonctions de trigger sont `SECURITY DEFINER`, car elles doivent consulter ou écrire des tables auxquelles le rôle MJ n'a pas accès directement. Le journal récupère le rôle actif, ou la session de connexion si aucun `SET ROLE` n'est utilisé.

Tests utiles : `CALL modifier_pv(1, -8, 'Gobelin')` produit une entrée de journal ; `SELECT lancer_de(6, 20, 'attaque')` échoue car Grok est mort ; donner l'« Enclume de forgeron » à Thorin échoue car sa charge dépasserait sa limite.

## Vues

Les vues du membre 3 centralisent l'affichage métier sans donner d'accès direct sur les tables.

- `vue_table_mj` est la vue de travail du MJ : elle expose la fiche complète de `personnages`, avec les libellés de race, classe et campagne, les six modificateurs D&D (`modificateur(force)`, `modificateur(dexterite)`, etc.) et le `de_vie`. Elle est construite sur une seule table (`personnages`) dans le `FROM`, ce qui laisse PostgreSQL la rendre modifiable automatiquement pour les champs de la table, notamment `notes_mj`.
- `vue_mj_inventaire` reprend `inventaire` et ajoute le nom et le poids de l'objet via des sous-requêtes scalaires. Le MJ peut l'utiliser pour insérer, mettre à jour ou supprimer une ligne d'inventaire, tout en conservant le trigger de charge sur `inventaire`.
- `vue_mj_jets` et `vue_mj_journal` sont des vues en lecture seule. Elles ajoutent le nom du personnage associé à chaque jet ou entrée de journal pour un historique exploitable dans l'interface de jeu.
- `vue_fiches_joueurs` ne montre que les personnages ayant un `joueur_id` non nul. Elle exclut `notes_mj`, donc le contenu réservé au MJ reste caché. Elle ne renvoie pas non plus les PNJ (`personnages.joueur_id IS NULL`), ce qui limite l'exposition aux fiches publiques des joueurs.

## Rôles

Les droits sont attribués aux rôles métier, pas aux comptes humains. Cela évite d'avoir à gérer des autorisations répétées et permet de faire évoluer les accès de façon claire.

- `maitre_du_jeu` : rôle du MJ. Il peut consulter toutes les vues du MJ et modifier via ses vues ; `SET ROLE mj_elminster;` puis `CALL modifier_pv(1, -8, 'Gobelin');` est autorisé. En revanche, `DELETE FROM personnages;` est refusée parce que les tables restent inaccessibles directement.
- `joueur` : rôle des joueurs. `SET ROLE joueur_pip; SELECT * FROM vue_fiches_joueurs;` est autorisé. La requête `SELECT notes_mj FROM personnages;` est refusée, et `CALL modifier_pv(1, -8, 'Gobelin');` est également bloquée.

Pour le bon fonctionnement des vues, `modificateur(int)` est exécutable par les deux rôles. Les autres fonctions de la base sont restreintes à `maitre_du_jeu` pour que les procédures métier restent centralisées dans PostgreSQL au lieu d'être laissées à des accès directs sur `personnages` ou `inventaire`.

## Index

_À rédiger par le membre 4 : la requête, le plan et le temps avant, puis après._

## Page Vercel

_À rédiger par le membre 4 : lien, et comment la page n'utilise que le rôle `maitre_du_jeu`._
