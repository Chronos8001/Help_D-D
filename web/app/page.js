import { getDb } from '../lib/db';

export const dynamic = 'force-dynamic';

async function loadDashboard(searchParams) {
  try {
    const sql = getDb();
    const campaigns = await sql`
      SELECT DISTINCT campagne_id AS id, campagne_nom AS nom
      FROM vue_table_mj
      ORDER BY campagne_id;
    `;
    const requestedCampaign = Number(searchParams.campagne);
    const activeCampaignId = campaigns.some((campaign) => Number(campaign.id) === requestedCampaign)
      ? requestedCampaign
      : campaigns.length > 0 ? Number(campaigns[0].id) : null;

    if (activeCampaignId === null) {
      return { campaigns, activeCampaignId, heroes: [], jets: [], journal: [], error: null };
    }

    const [heroes, jets, journal] = await Promise.all([
      sql`
        SELECT id, nom, niveau, pv_actuels, pv_max, statut
        FROM vue_table_mj
        WHERE campagne_id = ${activeCampaignId}
        ORDER BY id;
      `,
      sql`
        SELECT id, personnage_id, nom_personnage, type_jet, faces, resultat, total, lance_le
        FROM vue_mj_jets
        WHERE personnage_id IN (
          SELECT id FROM vue_table_mj WHERE campagne_id = ${activeCampaignId}
        )
        ORDER BY lance_le DESC
        LIMIT 10;
      `,
      sql`
        SELECT personnage_id, nom_personnage, ancien_pv, nouveau_pv, motif, auteur, le
        FROM vue_mj_journal
        WHERE personnage_id IN (
          SELECT id FROM vue_table_mj WHERE campagne_id = ${activeCampaignId}
        )
        ORDER BY le DESC
        LIMIT 10;
      `,
    ]);

    return { campaigns, activeCampaignId, heroes, jets, journal, error: null };
  } catch (error) {
    return {
      campaigns: [],
      activeCampaignId: null,
      heroes: [],
      jets: [],
      journal: [],
      error: error.message,
    };
  }
}

export default async function Page({ searchParams }) {
  const dashboard = await loadDashboard(searchParams);
  const notice = searchParams.notice;

  return (
    <main>
      <header>
        <div>
          <div className="badge">Grimoire</div>
          <h1>Table de campagne</h1>
        </div>
        <div className="badge">Connexion MJ</div>
      </header>

      {dashboard.error ? (
        <div className="alert">Erreur de connexion ou de droits : {dashboard.error}</div>
      ) : null}
      {notice ? <p className="notice">{notice}</p> : null}

      <section className="card">
        <h2>Campagne</h2>
        {dashboard.campaigns.length === 0 ? (
          <p className="muted">Aucune campagne disponible dans les vues accessibles.</p>
        ) : (
          <form method="get">
            <label htmlFor="campaign">Choisir une campagne : </label>
            <select id="campaign" name="campagne" defaultValue={dashboard.activeCampaignId}>
              {dashboard.campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>{campaign.nom}</option>
              ))}
            </select>
            <button type="submit">Afficher</button>
          </form>
        )}
      </section>

      <section className="grid" style={{ marginTop: '1rem' }}>
        {dashboard.heroes.map((hero) => (
          <article className="card" key={hero.id}>
            <h2>{hero.nom}</h2>
            <div className="stat"><span className="label">Niveau</span><span className="value">{hero.niveau}</span></div>
            <div className="stat"><span className="label">PV</span><span className="value">{hero.pv_actuels} / {hero.pv_max}</span></div>
            <progress value={hero.pv_actuels} max={hero.pv_max} aria-label={`Points de vie de ${hero.nom}`} />
            <div className="stat"><span className="label">Statut</span><span className="value">{hero.statut}</span></div>

            <form action="/api/action" method="post" className="actions">
              <input type="hidden" name="personnage" value={hero.id} />
              <input type="hidden" name="campagne" value={dashboard.activeCampaignId} />
              <label>
                Points :
                <input type="number" name="montant" min="1" defaultValue="1" required />
              </label>
              <label>
                Motif :
                <input type="text" name="motif" maxLength="200" defaultValue="Action de la page web" />
              </label>
              <button type="submit" name="operation" value="degats">Dégâts</button>
              <button type="submit" name="operation" value="soin">Soin</button>
              <button type="submit" name="operation" value="d20">Lancer un d20</button>
            </form>
          </article>
        ))}
      </section>

      <section className="grid" style={{ marginTop: '2rem' }}>
        <article className="card">
          <h2>Derniers jets</h2>
          {dashboard.jets.length === 0 ? (
            <p className="muted">Aucun jet à afficher.</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Personnage</th><th>Jet</th><th>Résultat</th><th>Date</th></tr>
              </thead>
              <tbody>
                {dashboard.jets.map((jet) => (
                  <tr key={jet.id}>
                    <td>{jet.nom_personnage}</td>
                    <td>{jet.type_jet} (d{jet.faces})</td>
                    <td>{jet.resultat} + {jet.total - jet.resultat} = {jet.total}</td>
                    <td>{new Date(jet.lance_le).toLocaleString('fr-FR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>

        <article className="card">
          <h2>Journal des PV</h2>
          {dashboard.journal.length === 0 ? (
            <p className="muted">Aucune entrée de journal.</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Personnage</th><th>PV</th><th>Motif</th><th>Auteur</th></tr>
              </thead>
              <tbody>
                {dashboard.journal.map((entry, index) => (
                  <tr key={`${entry.personnage_id}-${entry.le}-${index}`}>
                    <td>{entry.nom_personnage}</td>
                    <td>{entry.ancien_pv} → {entry.nouveau_pv}</td>
                    <td>{entry.motif || 'modification directe'}</td>
                    <td>{entry.auteur}</td>
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
