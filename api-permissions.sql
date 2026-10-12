\set ON_ERROR_STOP on
\getenv api_password GRIMOIRE_API_PASSWORD

SELECT 'CREATE ROLE grimoire_api LOGIN PASSWORD ' || quote_literal(:'api_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'grimoire_api')
\gexec

ALTER ROLE grimoire_api WITH LOGIN PASSWORD :'api_password';
SELECT format('GRANT CONNECT ON DATABASE %I TO grimoire_api', current_database())
\gexec
GRANT USAGE ON SCHEMA public TO grimoire_api;
GRANT SELECT (id, pseudo) ON joueurs TO grimoire_api;
GRANT SELECT ON campagnes, races, classes TO grimoire_api;
GRANT INSERT, UPDATE ON campagnes TO grimoire_api;
GRANT SELECT ON vue_fiches_joueurs TO grimoire_api;
GRANT SELECT (
    id, joueur_id, campagne_id, race_id, classe_id, nom, niveau, xp,
    force, dexterite, constitution, intelligence, sagesse, charisme,
    pv_max, pv_actuels, classe_armure, statut, cree_le, race_nom,
    classe_nom, campagne_nom, mod_force, mod_dexterite, mod_constitution,
    mod_intelligence, mod_sagesse, mod_charisme, de_vie
) ON vue_table_mj TO grimoire_api;
GRANT INSERT (
    joueur_id, campagne_id, race_id, classe_id, nom, niveau, xp,
    force, dexterite, constitution, intelligence, sagesse, charisme,
    pv_max, pv_actuels, classe_armure
) ON vue_table_mj TO grimoire_api;
GRANT EXECUTE ON FUNCTION modificateur(int) TO grimoire_api;
GRANT EXECUTE ON FUNCTION lancer_de(int, int, text, text) TO grimoire_api;
GRANT EXECUTE ON PROCEDURE modifier_pv(int, int, text) TO grimoire_api;
GRANT EXECUTE ON PROCEDURE distribuer_xp(int, int) TO grimoire_api;
GRANT USAGE, SELECT ON SEQUENCE personnages_id_seq, campagnes_id_seq TO grimoire_api;
