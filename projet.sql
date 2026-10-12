-- =====================================================================
--  Grimoire : gestionnaire de fiches de personnage Donjons & Dragons
--  SQL avancé B2 · projet de groupe · PostgreSQL
--
--  Ordre imposé : tables, données, fonctions/procédures, triggers,
--  vues, rôles, index. Le script doit passer sur une base VIDE.
--
--  Chaque section a un responsable (voir REPARTITION.md) :
--  ne modifiez que la vôtre, pour que l'historique Git reste lisible.
-- =====================================================================


-- =====================================================================
--  1. TABLES                                         (Membre 1)
-- =====================================================================

-- Les personnes réelles autour de la table (joueurs et MJ).
CREATE TABLE joueurs (
    id          serial       PRIMARY KEY,
    pseudo      varchar(40)  NOT NULL UNIQUE,
    email       varchar(120) UNIQUE,
    inscrit_le  date         NOT NULL DEFAULT current_date
);

-- Une campagne = une table de jeu, menée par un maître du jeu.
CREATE TABLE campagnes (
    id      serial       PRIMARY KEY,
    nom     varchar(100) NOT NULL UNIQUE,
    univers varchar(60)  NOT NULL DEFAULT 'Royaumes oubliés',
    mj_id   int          NOT NULL REFERENCES joueurs (id),
    debut   date         NOT NULL DEFAULT current_date,
    active  boolean      NOT NULL DEFAULT true
);

CREATE TABLE races (
    id        serial       PRIMARY KEY,
    nom       varchar(40)  NOT NULL UNIQUE,
    vitesse_m numeric(3,1) NOT NULL CHECK (vitesse_m > 0)   -- en mètres par tour
);

CREATE TABLE classes (
    id               serial      PRIMARY KEY,
    nom              varchar(40) NOT NULL UNIQUE,
    de_vie           smallint    NOT NULL CHECK (de_vie IN (6, 8, 10, 12)),
    carac_principale char(3)     NOT NULL
                     CHECK (carac_principale IN ('FOR','DEX','CON','INT','SAG','CHA'))
);

-- La fiche de personnage. joueur_id NULL = PNJ (personnage du MJ).
CREATE TABLE personnages (
    id            serial       PRIMARY KEY,
    joueur_id     int          REFERENCES joueurs (id),
    campagne_id   int          NOT NULL REFERENCES campagnes (id),
    race_id       int          NOT NULL REFERENCES races (id),
    classe_id     int          NOT NULL REFERENCES classes (id),
    nom           varchar(80)  NOT NULL,
    niveau        smallint     NOT NULL DEFAULT 1 CHECK (niveau BETWEEN 1 AND 20),
    xp            int          NOT NULL DEFAULT 0 CHECK (xp >= 0),
    force         smallint     NOT NULL CHECK (force        BETWEEN 1 AND 30),
    dexterite     smallint     NOT NULL CHECK (dexterite    BETWEEN 1 AND 30),
    constitution  smallint     NOT NULL CHECK (constitution BETWEEN 1 AND 30),
    intelligence  smallint     NOT NULL CHECK (intelligence BETWEEN 1 AND 30),
    sagesse       smallint     NOT NULL CHECK (sagesse      BETWEEN 1 AND 30),
    charisme      smallint     NOT NULL CHECK (charisme     BETWEEN 1 AND 30),
    pv_max        int          NOT NULL CHECK (pv_max > 0),
    pv_actuels    int          NOT NULL CHECK (pv_actuels >= 0),
    classe_armure smallint     NOT NULL DEFAULT 10 CHECK (classe_armure BETWEEN 1 AND 30),
    statut        varchar(12)  NOT NULL DEFAULT 'vivant'
                  CHECK (statut IN ('vivant', 'inconscient', 'mort')),
    notes_mj      text,                         -- secret : jamais montré aux joueurs
    cree_le       timestamptz  NOT NULL DEFAULT now(),
    CHECK (pv_actuels <= pv_max)
);

CREATE TABLE objets (
    id        serial        PRIMARY KEY,
    nom       varchar(80)   NOT NULL UNIQUE,
    categorie varchar(20)   NOT NULL
              CHECK (categorie IN ('arme', 'armure', 'équipement', 'potion', 'magique')),
    poids_kg  numeric(6,2)  NOT NULL CHECK (poids_kg >= 0),
    valeur_po numeric(10,2) NOT NULL DEFAULT 0 CHECK (valeur_po >= 0),
    rarete    varchar(12)   NOT NULL DEFAULT 'commun'
              CHECK (rarete IN ('commun', 'peu commun', 'rare', 'très rare', 'légendaire'))
);

-- Qui porte quoi. Règle métier (trigger, section 4) : la charge totale
-- ne dépasse pas Force × 7,5 kg.
CREATE TABLE inventaire (
    personnage_id int     NOT NULL REFERENCES personnages (id) ON DELETE CASCADE,
    objet_id      int     NOT NULL REFERENCES objets (id),
    quantite      int     NOT NULL DEFAULT 1 CHECK (quantite > 0),
    equipe        boolean NOT NULL DEFAULT false,
    PRIMARY KEY (personnage_id, objet_id)
);

-- Tous les jets de dés de toutes les tables : la grosse table (500 000 lignes).
CREATE TABLE jets_de_des (
    id            bigserial   PRIMARY KEY,
    personnage_id int         NOT NULL REFERENCES personnages (id) ON DELETE CASCADE,
    type_jet      varchar(12) NOT NULL
                  CHECK (type_jet IN ('attaque', 'dégâts', 'sauvegarde', 'compétence', 'initiative')),
    faces         smallint    NOT NULL CHECK (faces IN (4, 6, 8, 10, 12, 20, 100)),
    resultat      smallint    NOT NULL,
    modificateur  smallint    NOT NULL DEFAULT 0,
    total         int         GENERATED ALWAYS AS (resultat + modificateur) STORED,
    lance_le      timestamptz NOT NULL DEFAULT now(),
    CHECK (resultat BETWEEN 1 AND faces)
);

-- Historique des points de vie. Rempli uniquement par trigger (section 4).
CREATE TABLE journal_pv (
    id            bigserial   PRIMARY KEY,
    personnage_id int         NOT NULL REFERENCES personnages (id) ON DELETE CASCADE,
    ancien_pv     int         NOT NULL,
    nouveau_pv    int         NOT NULL,
    motif         text,
    auteur        text        NOT NULL,
    le            timestamptz NOT NULL DEFAULT now()
);


-- =====================================================================
--  2. DONNÉES                                        (Membre 1)
--  Tables référencées d'abord, puis celles qui pointent vers elles.
-- =====================================================================

INSERT INTO joueurs (pseudo, email) VALUES
    ('Elminster',  'elminster@grimoire.test'),   -- 1 : MJ de la campagne 1
    ('Volo',       'volo@grimoire.test'),        -- 2 : MJ de la campagne 2
    ('Brindille',  'brindille@grimoire.test'),
    ('Kaelis',     'kaelis@grimoire.test'),
    ('Mordak',     'mordak@grimoire.test'),
    ('Ysolde',     'ysolde@grimoire.test');

-- 34 joueurs de plus, pour peupler les autres tables.
INSERT INTO joueurs (pseudo, email)
SELECT 'Aventurier ' || i, 'aventurier' || i || '@grimoire.test'
FROM generate_series(7, 40) AS i;

INSERT INTO campagnes (nom, univers, mj_id, debut) VALUES
    ('La Mine perdue de Phandelver', 'Royaumes oubliés', 1, '2025-01-04'),
    ('La Malédiction de Strahd',     'Ravenloft',        2, '2025-03-15'),
    ('Le Tombeau de l''Annihilation','Royaumes oubliés', 1, '2025-06-01'),
    ('Les Voyages vers Eberron',     'Eberron',          2, '2025-09-20');

INSERT INTO races (nom, vitesse_m) VALUES
    ('Humain', 9), ('Elfe', 9), ('Nain', 7.5), ('Halfelin', 7.5), ('Demi-orc', 9),
    ('Gnome', 7.5), ('Tieffelin', 9), ('Drakéide', 9), ('Demi-elfe', 9);

INSERT INTO classes (nom, de_vie, carac_principale) VALUES
    ('Barbare',   12, 'FOR'), ('Barde',      8, 'CHA'), ('Clerc',       8, 'SAG'),
    ('Druide',     8, 'SAG'), ('Guerrier',  10, 'FOR'), ('Moine',       8, 'DEX'),
    ('Paladin',   10, 'FOR'), ('Rôdeur',    10, 'DEX'), ('Roublard',    8, 'DEX'),
    ('Ensorceleur',6, 'CHA'), ('Occultiste', 8, 'CHA'), ('Magicien',    6, 'INT');

INSERT INTO objets (nom, categorie, poids_kg, valeur_po, rarete) VALUES
    ('Épée longue',               'arme',        1.5,    15, 'commun'),
    ('Hache à deux mains',        'arme',        3.5,    30, 'commun'),
    ('Arc long',                  'arme',        1,      50, 'commun'),
    ('Dague',                     'arme',        0.5,     2, 'commun'),
    ('Bâton',                     'arme',        2,     0.2, 'commun'),
    ('Armure de plates',          'armure',     32.5,  1500, 'commun'),
    ('Cotte de mailles',          'armure',     27.5,    75, 'commun'),
    ('Armure de cuir',            'armure',      5,      10, 'commun'),
    ('Bouclier',                  'armure',      3,      10, 'commun'),
    ('Corde de chanvre (15 m)',   'équipement',  5,       1, 'commun'),
    ('Ration (1 jour)',           'équipement',  1,     0.5, 'commun'),
    ('Torche',                    'équipement',  0.5,  0.01, 'commun'),
    ('Sac de couchage',           'équipement',  3.5,     1, 'commun'),
    ('Outils de voleur',          'équipement',  0.5,    25, 'commun'),
    ('Grimoire',                  'équipement',  1.5,    50, 'commun'),
    ('Enclume de forgeron',       'équipement', 70,      40, 'commun'),   -- pour tester la charge
    ('Potion de soins',           'potion',      0.25,   50, 'commun'),
    ('Potion de soins supérieurs','potion',      0.25,  150, 'peu commun'),
    ('Sac sans fond',             'magique',     7.5,   500, 'peu commun'),
    ('Épée vorpale',              'magique',     1.5, 50000, 'légendaire');

-- Le groupe de démo (campagne 1), un PNJ et un personnage déjà mort.
INSERT INTO personnages
    (joueur_id, campagne_id, race_id, classe_id, nom, niveau, xp,
     force, dexterite, constitution, intelligence, sagesse, charisme,
     pv_max, pv_actuels, classe_armure, statut, notes_mj) VALUES
    (3,    1, 3, 5,  'Thorin Brisepierre',  3,  900, 16, 10, 16,  8, 12,  9, 34, 34, 18, 'vivant', 'Son frère est retenu à Cragmaw.'),
    (4,    1, 2, 12, 'Lyra Sylvanelle',     3,  900,  8, 14, 12, 17, 13, 10, 14, 14, 12, 'vivant', 'Le grimoire contient une page maudite.'),
    (5,    1, 4, 9,  'Pip Pieds-Légers',    3,  900, 10, 17, 14, 12, 10, 14, 23, 17, 14, 'vivant', 'Doit 200 po à la guilde des voleurs.'),
    (6,    1, 1, 3,  'Sœur Ysolde',         3,  900, 13,  9, 14, 10, 16, 12, 23, 23, 16, 'vivant', NULL),
    (NULL, 1, 1, 12, 'Glasstaff (PNJ)',     4, 2700,  9, 12, 12, 18, 11, 13, 22, 22, 12, 'vivant', 'C''est Iarno Albrek, traître de l''Alliance des Seigneurs.'),
    (3,    1, 5, 1,  'Grok le Téméraire',   2,  300, 17, 12, 15,  7,  9,  8, 25,  0, 13, 'mort',   'Mort au tour 3 contre le ver géant.');

-- 194 personnages générés, répartis sur les 4 campagnes.
-- PV max (règle D&D 5e) : dé de vie + mod(CON) au niveau 1,
-- puis (dé/2 + 1 + mod(CON)) par niveau supplémentaire.
INSERT INTO personnages
    (joueur_id, campagne_id, race_id, classe_id, nom, niveau, xp,
     force, dexterite, constitution, intelligence, sagesse, charisme,
     pv_max, pv_actuels, classe_armure)
SELECT g.joueur_id, g.campagne_id, g.race_id, g.classe_id, g.nom, g.niveau,
       (ARRAY[0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000])[g.niveau],
       g.fo, g.de, g.co, g.int_, g.sa, g.ch,
       pv.pv, pv.pv,
       10 + (g.de - 10) / 2 + (g.i % 6)
FROM (
    SELECT i,
           1 + (i % 40)                                    AS joueur_id,
           1 + (i % 4)                                     AS campagne_id,
           1 + (i % 9)                                     AS race_id,
           1 + (i % 12)                                    AS classe_id,
           (ARRAY['Aldric','Brynja','Cédric','Dagna','Eldrin','Fenna','Garrick','Hilda',
                  'Ivor','Jorunn','Kael','Liora','Magnus','Nessa','Orin'])[1 + i % 15]
             || ' ' ||
           (ARRAY['Courtevue','Ferpoing','Lunargent','Sombrebois','Hautecime','Rivefroide',
                  'Cendrelame','Tisseciel','Pierrefeu','Valombre','Brisevent','Clairsang'])[1 + (i / 15) % 12]
                                                           AS nom,
           1 + (i % 10)                                    AS niveau,
           8 + (random() * 10)::int AS fo,  8 + (random() * 10)::int AS de,
           8 + (random() * 10)::int AS co,  8 + (random() * 10)::int AS int_,
           8 + (random() * 10)::int AS sa,  8 + (random() * 10)::int AS ch
    FROM generate_series(7, 200) AS i
) AS g
JOIN classes AS c ON c.id = g.classe_id
CROSS JOIN LATERAL (
    SELECT greatest(1, c.de_vie + floor((g.co - 10) / 2.0)::int
                     + (g.niveau - 1) * (c.de_vie / 2 + 1 + floor((g.co - 10) / 2.0)::int)) AS pv
) AS pv;

-- Inventaire du groupe de démo (Thorin porte déjà 51 kg sur 120 autorisés).
INSERT INTO inventaire (personnage_id, objet_id, quantite, equipe)
SELECT p.id, o.id, v.quantite, v.equipe
FROM (VALUES
    ('Thorin Brisepierre', 'Armure de plates',          1, true),
    ('Thorin Brisepierre', 'Hache à deux mains',        1, true),
    ('Thorin Brisepierre', 'Ration (1 jour)',           10, false),
    ('Thorin Brisepierre', 'Corde de chanvre (15 m)',   1, false),
    ('Lyra Sylvanelle',    'Bâton',                     1, true),
    ('Lyra Sylvanelle',    'Grimoire',                  1, false),
    ('Lyra Sylvanelle',    'Potion de soins',           2, false),
    ('Pip Pieds-Légers',   'Dague',                     2, true),
    ('Pip Pieds-Légers',   'Armure de cuir',            1, true),
    ('Pip Pieds-Légers',   'Outils de voleur',          1, false),
    ('Sœur Ysolde',        'Cotte de mailles',          1, true),
    ('Sœur Ysolde',        'Bouclier',                  1, true),
    ('Sœur Ysolde',        'Potion de soins supérieurs',1, false)
) AS v (perso, objet, quantite, equipe)
JOIN personnages AS p ON p.nom = v.perso
JOIN objets      AS o ON o.nom = v.objet;

-- Trois objets légers pour chacun des personnages générés.
INSERT INTO inventaire (personnage_id, objet_id, quantite)
SELECT DISTINCT p.id, o.id, 1
FROM personnages AS p
CROSS JOIN generate_series(0, 2) AS k
JOIN objets AS o
  ON o.nom = (ARRAY['Dague', 'Torche', 'Ration (1 jour)', 'Potion de soins',
                    'Sac de couchage', 'Épée longue'])[1 + (p.id + k * 2) % 6]
WHERE p.id > 6;

-- 500 000 jets de dés, environ un toutes les 75 secondes depuis janvier 2025.
-- Le résultat est tiré entre 1 et le nombre de faces du dé.
INSERT INTO jets_de_des (personnage_id, type_jet, faces, resultat, modificateur, lance_le)
SELECT j.personnage_id, j.type_jet, j.faces,
       1 + floor(random() * j.faces)::int,
       (random() * 5)::int,
       j.lance_le
FROM (
    SELECT 1 + (i % 200) AS personnage_id,
           (ARRAY['attaque', 'dégâts', 'sauvegarde', 'compétence', 'initiative'])[1 + (i / 7) % 5] AS type_jet,
           (ARRAY[20, 20, 20, 20, 6, 8, 10, 12, 4, 100])[1 + (i / 3) % 10]                         AS faces,
           timestamptz '2025-01-04 20:00' + i * interval '75 seconds'                              AS lance_le
    FROM generate_series(1, 500000) AS i
) AS j;

ANALYZE;


-- =====================================================================
--  3. FONCTIONS ET PROCÉDURES                        (Membre 2)
-- =====================================================================

-- Arrondi vers le bas, notamment pour les scores impairs sous 10.
CREATE OR REPLACE FUNCTION modificateur(p_score int)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT floor((p_score - 10) / 2.0)::int;
$$;

CREATE OR REPLACE FUNCTION lancer_de(
    p_perso int,
    p_faces int,
    p_type text,
    p_carac text DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_force        smallint;
    v_dexterite    smallint;
    v_constitution smallint;
    v_intelligence smallint;
    v_sagesse      smallint;
    v_charisme     smallint;
    v_score        smallint;
    v_modificateur int := 0;
    v_resultat     int;
BEGIN
    IF p_faces IS NULL OR p_faces NOT IN (4, 6, 8, 10, 12, 20, 100) THEN
        RAISE EXCEPTION 'Nombre de faces invalide : %', p_faces;
    END IF;

    SELECT force, dexterite, constitution, intelligence, sagesse, charisme
    INTO v_force, v_dexterite, v_constitution, v_intelligence, v_sagesse, v_charisme
    FROM personnages
    WHERE id = p_perso;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Personnage % introuvable', p_perso;
    END IF;

    IF p_carac IS NOT NULL THEN
        v_score := CASE upper(p_carac)
            WHEN 'FOR' THEN v_force
            WHEN 'DEX' THEN v_dexterite
            WHEN 'CON' THEN v_constitution
            WHEN 'INT' THEN v_intelligence
            WHEN 'SAG' THEN v_sagesse
            WHEN 'CHA' THEN v_charisme
            ELSE NULL
        END;
        IF v_score IS NULL THEN
            RAISE EXCEPTION 'Caractéristique inconnue : % (FOR, DEX, CON, INT, SAG ou CHA)', p_carac;
        END IF;
        v_modificateur := modificateur(v_score);
    END IF;

    v_resultat := 1 + floor(random() * p_faces)::int;
    INSERT INTO jets_de_des (personnage_id, type_jet, faces, resultat, modificateur)
    VALUES (p_perso, p_type, p_faces, v_resultat, v_modificateur);

    RETURN v_resultat + v_modificateur;
END;
$$;

CREATE OR REPLACE PROCEDURE modifier_pv(p_perso int, p_delta int, p_motif text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_personnage personnages%ROWTYPE;
    v_pv_bruts   bigint;
    v_nouveaux_pv int;
    v_statut     varchar(12);
BEGIN
    SELECT * INTO v_personnage
    FROM personnages
    WHERE id = p_perso
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Personnage % introuvable', p_perso;
    END IF;
    IF v_personnage.statut = 'mort' AND p_delta > 0 THEN
        RAISE EXCEPTION 'Impossible de soigner % : le personnage est mort', v_personnage.nom;
    END IF;

    v_pv_bruts := v_personnage.pv_actuels::bigint + p_delta::bigint;
    v_nouveaux_pv := greatest(0, least(v_personnage.pv_max::bigint, v_pv_bruts))::int;
    v_statut := v_personnage.statut;

    IF v_personnage.statut <> 'mort' THEN
        IF p_delta < 0 AND v_pv_bruts <= 0 THEN
            IF -v_pv_bruts >= v_personnage.pv_max THEN
                v_statut := 'mort';
            ELSE
                v_statut := 'inconscient';
            END IF;
        ELSIF p_delta > 0 AND v_nouveaux_pv > 0 THEN
            v_statut := 'vivant';
        END IF;
    END IF;

    PERFORM set_config('grimoire.motif', coalesce(p_motif, ''), true);
    UPDATE personnages
    SET pv_actuels = v_nouveaux_pv,
        statut = v_statut
    WHERE id = p_perso;
    PERFORM set_config('grimoire.motif', '', true);
END;
$$;

CREATE OR REPLACE PROCEDURE distribuer_xp(p_campagne int, p_xp int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_personnage record;
    v_xp_total   bigint;
    v_niveau     smallint;
    v_gain_niveaux int;
    v_gain_pv    int;
BEGIN
    IF p_xp IS NULL OR p_xp < 0 THEN
        RAISE EXCEPTION 'Le gain d''XP doit être positif ou nul';
    END IF;

    FOR v_personnage IN
        SELECT p.id, p.niveau, p.xp, p.constitution, c.de_vie
        FROM personnages AS p
        JOIN classes AS c ON c.id = p.classe_id
        WHERE p.campagne_id = p_campagne
          AND p.statut <> 'mort'
        FOR UPDATE OF p
    LOOP
        v_xp_total := v_personnage.xp::bigint + p_xp;
        IF v_xp_total > 2147483647 THEN
            RAISE EXCEPTION 'Le total d''XP dépasse la capacité de stockage pour le personnage %', v_personnage.id;
        END IF;

        SELECT max(palier.niveau)::smallint
        INTO v_niveau
        FROM unnest(ARRAY[
            0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
            85000, 100000, 120000, 140000, 165000, 195000, 225000,
            265000, 305000, 355000
        ]) WITH ORDINALITY AS palier(xp, niveau)
        WHERE palier.xp <= v_xp_total;

        v_gain_niveaux := greatest(0, v_niveau - v_personnage.niveau);
        v_gain_pv := v_gain_niveaux * (
            v_personnage.de_vie / 2 + 1 + modificateur(v_personnage.constitution)
        );

        UPDATE personnages
        SET xp = v_xp_total::int,
            niveau = greatest(niveau, v_niveau),
            pv_max = pv_max + v_gain_pv
        WHERE id = v_personnage.id;
    END LOOP;
END;
$$;


-- =====================================================================
--  4. TRIGGERS                                       (Membre 2)
-- =====================================================================

CREATE OR REPLACE FUNCTION verifier_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_nom       varchar(80);
    v_force     smallint;
    v_poids     numeric(10,2);
    v_charge    numeric(10,2);
    v_autorise  numeric(10,1);
BEGIN
    SELECT nom, force, force * 7.5
    INTO v_nom, v_force, v_autorise
    FROM personnages
    WHERE id = NEW.personnage_id;

    SELECT poids_kg INTO v_poids
    FROM objets
    WHERE id = NEW.objet_id;

    IF TG_OP = 'UPDATE' THEN
        SELECT coalesce(sum(i.quantite * o.poids_kg), 0)
        INTO v_charge
        FROM inventaire AS i
        JOIN objets AS o ON o.id = i.objet_id
        WHERE i.personnage_id = NEW.personnage_id
          AND (i.personnage_id, i.objet_id)
              IS DISTINCT FROM (OLD.personnage_id, OLD.objet_id);
    ELSE
        SELECT coalesce(sum(i.quantite * o.poids_kg), 0)
        INTO v_charge
        FROM inventaire AS i
        JOIN objets AS o ON o.id = i.objet_id
        WHERE i.personnage_id = NEW.personnage_id;
    END IF;
    v_poids := v_charge + NEW.quantite * v_poids;

    IF v_nom IS NOT NULL AND v_poids > v_autorise THEN
        RAISE EXCEPTION '% ne peut pas porter ça : % kg pour % kg autorisés (Force %).',
            v_nom, to_char(v_poids, 'FM999999990.00'),
            to_char(v_autorise, 'FM999999990.0'), v_force;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_verifier_charge
BEFORE INSERT OR UPDATE ON inventaire
FOR EACH ROW
EXECUTE FUNCTION verifier_charge();

CREATE OR REPLACE FUNCTION interdire_jet_mort()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_nom varchar(80);
    v_statut varchar(12);
BEGIN
    SELECT nom, statut INTO v_nom, v_statut
    FROM personnages
    WHERE id = NEW.personnage_id;

    IF v_statut = 'mort' THEN
        RAISE EXCEPTION 'Impossible de lancer un dé : % est mort', v_nom;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_interdire_jet_mort
BEFORE INSERT ON jets_de_des
FOR EACH ROW
EXECUTE FUNCTION interdire_jet_mort();

CREATE OR REPLACE FUNCTION journaliser_pv()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO journal_pv (personnage_id, ancien_pv, nouveau_pv, motif, auteur)
    VALUES (
        NEW.id,
        OLD.pv_actuels,
        NEW.pv_actuels,
        coalesce(nullif(current_setting('grimoire.motif', true), ''), 'modification directe'),
        coalesce(nullif(current_setting('role'), 'none'), session_user)
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_journaliser_pv
AFTER UPDATE OF pv_actuels ON personnages
FOR EACH ROW
WHEN (OLD.pv_actuels IS DISTINCT FROM NEW.pv_actuels)
EXECUTE FUNCTION journaliser_pv();
-- =====================================================================
--  5. VUES                                           (Membre 3)
--  À faire : vue_table_mj, vue_mj_inventaire, vue_mj_jets,
--            vue_mj_journal, vue_fiches_joueurs
-- =====================================================================


-- =====================================================================
--  6. RÔLES ET PRIVILÈGES                            (Membre 3)
--  À faire : maitre_du_jeu + mj_elminster, joueur + joueur_pip
-- =====================================================================


-- =====================================================================
--  7. INDEX                                          (Membre 4)
--  À faire : idx_jets_personnage_date, idx_jets_critiques
-- =====================================================================
