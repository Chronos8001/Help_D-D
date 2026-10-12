# API de la page Grimoire · contrat à implémenter

La page React (`src/App.jsx`) est prête. Elle appelle trois routes qui **restent à écrire**.
L'API sert d'intermédiaire : elle garde le mot de passe de la base côté serveur, ce que le
navigateur ne doit jamais voir.

## Où et comment

- Des **fonctions serverless Vercel**, un fichier par route dans `web/api/` :
  `campagnes.js`, `table.js`, `action.js`. Chaque fichier exporte
  `export default async function handler(req, res)`.
- Pour le code partagé (connexion…), utilisez un fichier préfixé par `_`, comme `api/_db.js`.
  Vercel ne l'expose pas comme route.
- Connexion avec le paquet `postgres` (`npm install postgres`). `DATABASE_URL` utilise le compte
  **`mj_elminster`**, jamais le propriétaire. SSL `require` sur Neon, désactivé en local
  (`DATABASE_SSL=disable`).
- **Uniquement les vues et les procédures.** Le rôle n'a aucun droit sur les tables : une
  requête sur `personnages` sera refusée, et c'est voulu.
- Toutes les réponses sont en JSON. En cas d'erreur, renvoyez `{ "error": "<message>" }` avec
  un code ≠ 2xx. La page affiche ce message tel quel.

## Les trois routes

### `GET /api/campagnes`

Liste des campagnes, depuis `vue_table_mj` (`campagne_id`, `campagne_nom`, sans doublon).

```json
[{ "id": 1, "nom": "La Mine perdue de Phandelver" }, …]
```

### `GET /api/table?campagne=1`

```json
{
  "heros":   [{ "id", "nom", "race_nom", "classe_nom", "niveau", "classe_armure",
                "pv_actuels", "pv_max", "statut", "notes_mj" }],
  "jets":    [{ "id", "personnage_id", "nom_personnage", "type_jet", "faces",
                "resultat", "modificateur", "total", "lance_le" }],
  "journal": [{ "id", "personnage_id", "nom_personnage", "ancien_pv", "nouveau_pv",
                "motif", "auteur", "le" }]
}
```

- `heros` : `vue_table_mj` filtrée sur la campagne, triée par `id`.
- `jets` : les 10 derniers jets de la campagne (`vue_mj_jets`).
  - Attention aux performances : un simple `WHERE personnage_id IN (…) ORDER BY lance_le DESC`
    prend environ 110 ms sur 500 000 lignes.
  - Avec un `CROSS JOIN LATERAL` qui prend les 10 derniers jets *par personnage*, l'index
    `idx_jets_personnage_date` est utilisé.
- `journal` : les 10 dernières entrées de `vue_mj_journal` pour la campagne.
- Un paramètre `campagne` absent ou invalide donne une erreur `400`.

### `POST /api/action`

Corps JSON : `{ "operation", "personnage", "montant", "motif" }`

| `operation` | Appel SQL | Réponse OK |
|---|---|---|
| `degats` | `CALL modifier_pv(personnage, -montant, motif)` | `{ "message": "Dégâts appliqués." }` |
| `soin` | `CALL modifier_pv(personnage, montant, motif)` | `{ "message": "Soin appliqué." }` |
| `d20` | `SELECT lancer_de(personnage, 20, 'attaque')` | `{ "message": "Jet d20 : 17." }` |

- Validez les entrées : `personnage` et `montant` doivent être des entiers > 0, et `motif`
  fait au plus 200 caractères. **Requêtes paramétrées obligatoires**, jamais de concaténation SQL.
- Si PostgreSQL refuse, renvoyez son message en erreur (par exemple `422`). Exemple :
  `{ "error": "Impossible de lancer un dé : Grok le Téméraire est mort" }`.
- **CSRF** : refusez (`403`) un POST dont l'en-tête `Origin` ne correspond pas à l'hôte.

## Protection par mot de passe

Ajoutez un `middleware.js` à la racine de `web/` (middleware Vercel) qui vérifie une
authentification **Basic Auth** sur toutes les requêtes, avec les variables
`BASIC_AUTH_USER` et `BASIC_AUTH_PASSWORD`. Sans ces variables, il répond `503` plutôt que
de laisser passer. Sans cette protection, n'importe qui sur Internet peut modifier la base.

## Tests attendus

1. Sans mot de passe : `401`.
2. `GET /api/campagnes` renvoie 4 campagnes.
3. `d20` sur le personnage 6 (Grok, mort) renvoie l'erreur du trigger, affichée en rouge sur la page.
4. `degats` sur Thorin (id 1) fait apparaître une ligne dans le journal avec l'auteur `mj_elminster`.
5. Un POST avec `Origin: http://autre-site.test` renvoie `403`.
