-- =====================================================================
--  Comptes de l'application web (connexion joueur / MJ / admin).
--  À exécuter après projet.sql, puis relancer api-permissions.sql.
--  Séparé de projet.sql : ces tables ne servent qu'à l'API du Grimoire.
-- =====================================================================

-- Un compte de connexion. joueur_id relie le compte à la personne réelle :
-- obligatoire pour un joueur ou un MJ (campagnes.mj_id pointe vers joueurs).
CREATE TABLE IF NOT EXISTS comptes (
    id           serial       PRIMARY KEY,
    identifiant  varchar(40)  NOT NULL UNIQUE,
    mot_de_passe text         NOT NULL,  -- empreinte scrypt, jamais le mot de passe en clair
    role         varchar(10)  NOT NULL CHECK (role IN ('joueur', 'mj', 'admin')),
    joueur_id    int          UNIQUE REFERENCES joueurs (id) ON DELETE CASCADE,
    actif        boolean      NOT NULL DEFAULT true,
    cree_le      timestamptz  NOT NULL DEFAULT now(),
    CHECK (role = 'admin' OR joueur_id IS NOT NULL)
);

-- Sessions ouvertes. Seule l'empreinte SHA-256 du jeton est stockée.
CREATE TABLE IF NOT EXISTS sessions (
    jeton_hash char(64)    PRIMARY KEY,
    compte_id  int         NOT NULL REFERENCES comptes (id) ON DELETE CASCADE,
    expire_le  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_compte ON sessions (compte_id);
