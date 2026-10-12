-- Démo de la présentation : ordre imposé.
-- 1. Rôle
-- 2. Vue
-- 3. Index (drop + mesure + create + mesure)
-- 4. Trigger

\echo '--- 1) Rôle ---'
SET ROLE maitre_du_jeu;
SELECT current_user AS utilisateur, current_setting('role', true) AS role_active;

\echo '--- 2) Vue ---'
SELECT id, nom, niveau, classe_armure, pv_actuels, pv_max
FROM vue_fiches_joueurs
ORDER BY id
LIMIT 5;

\echo '--- 3) Index : les commandes de mesure nécessitent le propriétaire ---'
RESET ROLE;

\echo '--- 3) Index : historique d''un personnage ---'
DROP INDEX IF EXISTS idx_jets_personnage_date;
EXPLAIN ANALYZE
SELECT *
FROM jets_de_des
WHERE personnage_id = 1
ORDER BY lance_le DESC
LIMIT 20;

CREATE INDEX idx_jets_personnage_date
    ON jets_de_des (personnage_id, lance_le DESC);

EXPLAIN ANALYZE
SELECT *
FROM jets_de_des
WHERE personnage_id = 1
ORDER BY lance_le DESC
LIMIT 20;

\echo '--- 3) Index : 20 naturels ---'
DROP INDEX IF EXISTS idx_jets_critiques;
EXPLAIN ANALYZE
SELECT *
FROM jets_de_des
WHERE faces = 20 AND resultat = 20
ORDER BY lance_le DESC
LIMIT 10;

CREATE INDEX idx_jets_critiques
    ON jets_de_des (lance_le DESC)
    WHERE faces = 20 AND resultat = 20;

EXPLAIN ANALYZE
SELECT *
FROM jets_de_des
WHERE faces = 20 AND resultat = 20
ORDER BY lance_le DESC
LIMIT 10;

\echo '--- 4) Trigger : mort interdit ---'
SET ROLE maitre_du_jeu;
DO $$
BEGIN
    PERFORM lancer_de(6, 20, 'attaque');
    RAISE NOTICE 'Le trigger n''a pas refusé le jet de Grok.';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Jet refusé comme attendu : %', SQLERRM;
END;
$$;
