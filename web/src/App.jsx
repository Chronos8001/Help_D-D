import { useCallback, useEffect, useState } from 'react';

// Appelle l'API et renvoie le JSON, ou lève une erreur avec le message de PostgreSQL.
async function api(path, options) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Erreur ${response.status}`);
  return body;
}

function campagneDansUrl() {
  return Number(new URLSearchParams(window.location.search).get('campagne')) || null;
}

export default function App() {
  const [campagnes, setCampagnes] = useState([]);
  const [campagne, setCampagne] = useState(campagneDansUrl);
  const [table, setTable] = useState({ heros: [], jets: [], journal: [] });
  const [notice, setNotice] = useState(null); // { type: 'ok' | 'erreur', texte }
  const [occupe, setOccupe] = useState(false);

  // Liste des campagnes, une seule fois au chargement.
  useEffect(() => {
    api('/api/campagnes')
      .then((liste) => {
        setCampagnes(liste);
        setCampagne((actuelle) =>
          liste.some((c) => c.id === actuelle) ? actuelle : liste[0]?.id ?? null);
      })
      .catch((error) => setNotice({ type: 'erreur', texte: `Connexion ou droits : ${error.message}` }));
  }, []);

  const recharger = useCallback(async () => {
    if (!campagne) return;
    try {
      setTable(await api(`/api/table?campagne=${campagne}`));
    } catch (error) {
      setNotice({ type: 'erreur', texte: error.message });
    }
  }, [campagne]);

  // Recharge la table et garde la campagne dans l'URL quand on en change.
  useEffect(() => {
    if (!campagne) return;
    window.history.replaceState(null, '', `?campagne=${campagne}`);
    recharger();
  }, [campagne, recharger]);

  async function agir(action) {
    setOccupe(true);
    try {
      const { message } = await api('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action),
      });
      setNotice({ type: 'ok', texte: message });
    } catch (error) {
      // Les refus des triggers et des procédures arrivent ici.
      setNotice({ type: 'erreur', texte: `Refusé par la base : ${error.message}` });
    } finally {
      setOccupe(false);
      recharger();
    }
  }

  return (
    <main>
      <header>
        <div>
          <div className="badge">Grimoire</div>
          <h1>Table de campagne</h1>
        </div>
        <div className="badge">Connexion MJ</div>
      </header>

      {notice ? (
        <p className={notice.type === 'erreur' ? 'alert' : 'notice'}>{notice.texte}</p>
      ) : null}

      <section className="card">
        <h2>Campagne</h2>
        {campagnes.length === 0 ? (
          <p className="muted">Aucune campagne disponible dans les vues accessibles.</p>
        ) : (
          <select
            aria-label="Choisir une campagne"
            value={campagne ?? ''}
            onChange={(event) => setCampagne(Number(event.target.value))}
          >
            {campagnes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        )}
      </section>

      <section className="grid" style={{ marginTop: '1rem' }}>
        {table.heros.map((hero) => (
          <FicheHero key={hero.id} hero={hero} occupe={occupe} onAction={agir} />
        ))}
      </section>

      <section className="grid" style={{ marginTop: '2rem' }}>
        <article className="card">
          <h2>Derniers jets</h2>
          {table.jets.length === 0 ? (
            <p className="muted">Aucun jet à afficher.</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Personnage</th><th>Jet</th><th>Résultat</th><th>Date</th></tr>
              </thead>
              <tbody>
                {table.jets.map((jet) => (
                  <tr key={jet.id}>
                    <td>{jet.nom_personnage}</td>
                    <td>{jet.type_jet} (d{jet.faces})</td>
                    <td>{jet.resultat} + {jet.modificateur} = {jet.total}</td>
                    <td>{new Date(jet.lance_le).toLocaleString('fr-FR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>

        <article className="card">
          <h2>Journal des PV</h2>
          {table.journal.length === 0 ? (
            <p className="muted">Aucune entrée de journal.</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Personnage</th><th>PV</th><th>Motif</th><th>Auteur</th></tr>
              </thead>
              <tbody>
                {table.journal.map((entree) => (
                  <tr key={entree.id}>
                    <td>{entree.nom_personnage}</td>
                    <td>{entree.ancien_pv} → {entree.nouveau_pv}</td>
                    <td>{entree.motif}</td>
                    <td>{entree.auteur}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      </section>
    </main>
  );
}

function FicheHero({ hero, occupe, onAction }) {
  const [montant, setMontant] = useState(1);
  const [motif, setMotif] = useState('Action de la page web');

  const envoyer = (operation) => onAction({ operation, personnage: hero.id, montant, motif });

  return (
    <article className="card">
      <h2>{hero.nom}</h2>
      <p className="muted">{hero.race_nom} · {hero.classe_nom}</p>
      <div className="stat"><span className="label">Niveau</span><span className="value">{hero.niveau}</span></div>
      <div className="stat"><span className="label">CA</span><span className="value">{hero.classe_armure}</span></div>
      <div className="stat"><span className="label">PV</span><span className="value">{hero.pv_actuels} / {hero.pv_max}</span></div>
      <progress value={hero.pv_actuels} max={hero.pv_max} aria-label={`Points de vie de ${hero.nom}`} />
      <div className="stat"><span className="label">Statut</span><span className={`value statut-${hero.statut}`}>{hero.statut}</span></div>
      {hero.notes_mj ? <p className="secret">Note MJ : {hero.notes_mj}</p> : null}

      <form className="actions" onSubmit={(event) => event.preventDefault()}>
        <label>
          Points :
          <input
            type="number"
            min="1"
            value={montant}
            onChange={(event) => setMontant(Number(event.target.value))}
          />
        </label>
        <label>
          Motif :
          <input type="text" maxLength="200" value={motif} onChange={(event) => setMotif(event.target.value)} />
        </label>
        <button type="button" disabled={occupe} onClick={() => envoyer('degats')}>Dégâts</button>
        <button type="button" disabled={occupe} onClick={() => envoyer('soin')}>Soin</button>
        <button type="button" disabled={occupe} onClick={() => envoyer('d20')}>Lancer un d20</button>
      </form>
    </article>
  );
}
