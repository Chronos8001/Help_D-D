-- Démo de la présentation : ordre imposé.
-- 1. Rôle    : une action autorisée, une action refusée
-- 2. Vue     : ce qu'elle montre, ce qu'elle cache
-- 3. Index   : la requête, le temps avant, le temps après
-- 4. Trigger : l'action qui le déclenche, ce qu'on observe
--
-- À lancer en tant que propriétaire de la base (dnd), SANS ON_ERROR_STOP :
-- les refus sont des erreurs attendues et la démo doit continuer.

\echo ''
\echo '===================== 1) RÔLES ====================='

\echo '--- MJ (mj_elminster) : autorisé, il passe par la procédure modifier_pv ---'
SET ROLE mj_elminster;
SELECT current_user AS utilisateur;
SELECT nom, pv_actuels, pv_max FROM vue_table_mj WHERE id = 1;
CALL modifier_pv(1, -5, 'coup de gobelin');
SELECT nom, pv_actuels, pv_max FROM vue_table_mj WHERE id = 1;

\echo '--- MJ : refusé, aucun droit direct sur la table ---'
SELECT * FROM personnages LIMIT 1;
RESET ROLE;

\echo '--- Joueur (joueur_pip) : autorisé, lecture de sa vue ---'
SET ROLE joueur_pip;
SELECT current_user AS utilisateur;
SELECT nom, niveau, pv_actuels, pv_max FROM vue_fiches_joueurs ORDER BY id LIMIT 3;

\echo '--- Joueur : refusé, pas le droit sur la vue du MJ ---'
SELECT nom, notes_mj FROM vue_table_mj LIMIT 1;

\echo '--- Joueur : refusé, il ne peut pas modifier ses PV ---'
UPDATE vue_fiches_joueurs SET pv_actuels = 99 WHERE id = 3;

\echo '--- Joueur : refusé, pas le droit de lancer un dé par la fonction du MJ ---'
SELECT lancer_de(3, 20, 'attaque');
RESET ROLE;


\echo ''
\prompt '>>> Entrée pour la suite... ' pause
\echo '===================== 2) VUES ====================='

\echo '--- Ce que voit le MJ : notes secrètes et PNJ (Glasstaff, joueur_id NULL) ---'
SET ROLE mj_elminster;
SELECT id, nom, joueur_id, notes_mj FROM vue_table_mj WHERE campagne_id = 1 ORDER BY id;
RESET ROLE;

\echo '--- Ce que voit le joueur : même campagne, sans notes_mj et sans le PNJ ---'
SET ROLE joueur_pip;
SELECT id, nom, race_nom, classe_nom, mod_force, mod_dexterite
FROM vue_fiches_joueurs WHERE campagne_id = 1 ORDER BY id;

\echo '--- La colonne cachée n''existe même pas dans la vue (erreur attendue) ---'
SELECT notes_mj FROM vue_fiches_joueurs LIMIT 1;
RESET ROLE;


\echo ''
\prompt '>>> Entrée pour la suite... ' pause
\echo '===================== 3) INDEX ====================='
\echo '(mesures faites par le propriétaire : il faut pouvoir supprimer et recréer l''index)'

SELECT count(*) AS lignes_dans_jets_de_des FROM jets_de_des;

\echo '--- Index 1 : les 20 derniers jets d''un personnage. AVANT ---'
DROP INDEX IF EXISTS idx_jets_personnage_date;
EXPLAIN ANALYZE
SELECT * FROM jets_de_des
WHERE personnage_id = 1
ORDER BY lance_le DESC
LIMIT 20;

CREATE INDEX idx_jets_personnage_date
    ON jets_de_des (personnage_id, lance_le DESC);
ANALYZE jets_de_des;

\echo '--- Index 1 : APRÈS ---'
EXPLAIN ANALYZE
SELECT * FROM jets_de_des
WHERE personnage_id = 1
ORDER BY lance_le DESC
LIMIT 20;

\echo '--- Index 2 (partiel) : les 10 derniers 20 naturels. AVANT ---'
DROP INDEX IF EXISTS idx_jets_critiques;
EXPLAIN ANALYZE
SELECT * FROM jets_de_des
WHERE faces = 20 AND resultat = 20
ORDER BY lance_le DESC
LIMIT 10;

CREATE INDEX idx_jets_critiques
    ON jets_de_des (lance_le DESC)
    WHERE faces = 20 AND resultat = 20;
ANALYZE jets_de_des;

\echo '--- Index 2 : APRÈS ---'
EXPLAIN ANALYZE
SELECT * FROM jets_de_des
WHERE faces = 20 AND resultat = 20
ORDER BY lance_le DESC
LIMIT 10;


\echo ''
\prompt '>>> Entrée pour la suite... ' pause
\echo '===================== 4) TRIGGERS ====================='

\echo '--- Charge : Thorin (Force 16, 120 kg max) porte déjà 51 kg ---'
SET ROLE mj_elminster;
SELECT sum(quantite * poids_kg) AS charge_thorin_kg
FROM vue_mj_inventaire WHERE personnage_id = 1;

\echo '--- On lui donne l''enclume de 70 kg : refusé par trg_verifier_charge ---'
INSERT INTO vue_mj_inventaire (personnage_id, objet_id, quantite, equipe)
VALUES (1, 16, 1, false);

\echo '--- Un personnage mort ne lance plus de dés : refusé par trg_interdire_jet_mort ---'
SELECT nom, statut FROM vue_table_mj WHERE id = 6;
SELECT lancer_de(6, 20, 'attaque');

\echo '--- Un vivant, lui, lance normalement ---'
SELECT lancer_de(1, 20, 'attaque', 'FOR') AS total_thorin;

\echo '--- Journal des PV : rempli tout seul par trg_journaliser_pv ---'
CALL modifier_pv(1, 5, 'potion de soins');
SELECT nom_personnage, ancien_pv, nouveau_pv, motif, auteur, le
FROM vue_mj_journal ORDER BY id DESC LIMIT 2;
RESET ROLE;

\echo ''
\echo '===================== FIN DE LA DÉMO ====================='
