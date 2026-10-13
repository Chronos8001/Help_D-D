const state = {
  compte: null,
  campaigns: [],
  references: { joueurs: [], races: [], classes: [] },
  myCharacters: [],
  party: [],
  gmCharacters: [],
  accounts: [],
  selectedCampaign: null,
  view: null
};

const roleLabels = { joueur: 'Joueur', mj: 'Maître du jeu', admin: 'Admin' };

const $ = (selector) => document.querySelector(selector);
const isMj = () => ['mj', 'admin'].includes(state.compte?.role);
const isAdmin = () => state.compte?.role === 'admin';
const hasPlayerSpace = () => state.compte?.role === 'joueur' || state.myCharacters.length > 0;
const managedCampaigns = () => state.campaigns.filter((campaign) =>
  isAdmin() || campaign.mj_id === state.compte?.joueur_id);
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function notice(message, isError = false) {
  const node = $('#notice');
  node.textContent = message;
  node.classList.toggle('error', isError);
}

function populateSelect(select, items, { placeholder, valueKey = 'id', labelKey = 'nom' } = {}) {
  const existing = select.value;
  select.replaceChildren();
  if (placeholder !== undefined) select.append(new Option(placeholder, ''));
  for (const item of items) select.append(new Option(item[labelKey], item[valueKey]));
  if ([...select.options].some((option) => option.value === existing)) select.value = existing;
}

function formatDate(value) {
  return new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ---------- Navigation ----------

function availableViews() {
  const views = [];
  if (isMj()) views.push(['campagnes', isAdmin() ? 'Campagnes' : 'Mes campagnes'], ['creer', 'Créer']);
  if (hasPlayerSpace()) views.push(['personnages', 'Mes personnages'], ['groupe', 'Mon groupe']);
  if (isAdmin()) views.push(['comptes', 'Comptes']);
  return views;
}

function renderTabs() {
  const tabs = $('#tabs');
  tabs.replaceChildren();
  for (const [name, label] of availableViews()) {
    const tab = element('a', 'tab', label);
    tab.href = `#${name}`;
    tab.dataset.view = name;
    if (name === state.view) tab.setAttribute('aria-current', 'page');
    tabs.append(tab);
  }
}

function showView(name) {
  const views = availableViews().map(([view]) => view);
  state.view = views.includes(name) ? name : views[0];
  document.querySelectorAll('.view').forEach((view) => {
    view.hidden = view.id !== `view-${state.view}`;
  });
  history.replaceState(null, '', `#${state.view}`);
  renderTabs();
  notice('');
}

// ---------- Fiches ----------

function characterCard(character) {
  const card = element('article', 'character-card');
  const top = element('div', 'character-top');
  const emblem = element('span', 'character-emblem', character.classe_nom?.slice(0, 1) || '✦');
  const identity = element('div', 'character-identity');
  identity.append(element('h3', '', character.nom));
  identity.append(element('p', 'character-subtitle', `${character.race_nom} · ${character.classe_nom} · niv. ${character.niveau}`));
  top.append(emblem, identity, element('span', `status status-${character.statut}`, character.statut));
  const campaign = element('p', 'character-campaign', character.campagne_nom);
  const stats = element('div', 'stat-row');
  for (const [label, value, modifier] of [
    ['FOR', character.force, character.mod_force], ['DEX', character.dexterite, character.mod_dexterite],
    ['CON', character.constitution, character.mod_constitution], ['INT', character.intelligence, character.mod_intelligence],
    ['SAG', character.sagesse, character.mod_sagesse], ['CHA', character.charisme, character.mod_charisme]
  ]) {
    const stat = element('span', 'stat');
    stat.append(element('small', '', label), element('b', '', String(value)),
      element('small', 'stat-mod', modifier >= 0 ? `+${modifier}` : String(modifier)));
    stats.append(stat);
  }
  const footer = element('div', 'character-footer');
  footer.append(element('span', '', `CA ${character.classe_armure}`), element('span', '', `${character.xp} XP`));
  card.append(top, campaign, hpLine(character), stats, footer);
  return card;
}

function hpLine(character) {
  const bar = element('div', 'hp-line');
  const track = element('span', 'hp-track');
  const fill = element('span', 'hp-fill');
  const ratio = character.pv_max ? character.pv_actuels / character.pv_max : 0;
  fill.style.width = `${Math.max(0, Math.min(100, ratio * 100))}%`;
  if (ratio < 0.3) fill.classList.add('hp-low');
  track.append(fill);
  bar.append(element('span', 'hp-text', `${character.pv_actuels} / ${character.pv_max}`), track);
  return bar;
}

// Liste compacte : une ligne par personnage, lisible même avec 50 fiches.
function renderRoster(container, characters, { withHpControls = false, highlightPlayer = null } = {}) {
  container.replaceChildren();
  container.classList.toggle('roster-actions', withHpControls);
  if (characters.length === 0) {
    container.append(element('p', 'roster-empty', 'Aucun personnage à afficher.'));
    return;
  }
  const head = element('div', 'roster-row roster-head');
  for (const label of ['Personnage', 'Joueur', 'Niv.', 'PV', 'CA', 'État', ...(withHpControls ? ['Points de vie'] : [])]) {
    head.append(element('span', '', label));
  }
  container.append(head);
  for (const character of characters) {
    const row = element('div', 'roster-row');
    if (highlightPlayer && character.joueur_id === highlightPlayer) row.classList.add('is-mine');
    const name = element('div', 'r-name');
    name.append(element('strong', '', character.nom), element('small', '', `${character.race_nom} · ${character.classe_nom}`));
    row.append(
      name,
      element('span', `r-player${character.joueur_id ? '' : ' is-npc'}`, character.joueur_pseudo || 'PNJ'),
      element('span', 'r-level', `Niv. ${character.niveau}`),
      hpLine(character),
      element('span', 'r-ca', `CA ${character.classe_armure}`),
      element('span', `status status-${character.statut}`, character.statut)
    );
    if (withHpControls) {
      const actions = element('div', 'r-actions');
      const amount = element('input', 'hp-amount');
      amount.type = 'number';
      amount.min = '1';
      amount.value = '1';
      amount.setAttribute('aria-label', `PV pour ${character.nom}`);
      const damage = element('button', 'button button-small', '− Dégâts');
      damage.type = 'button';
      damage.dataset.hp = '-';
      const heal = element('button', 'button button-small', '+ Soin');
      heal.type = 'button';
      heal.dataset.hp = '+';
      actions.dataset.character = character.id;
      actions.append(amount, damage, heal);
      row.append(actions);
    }
    container.append(row);
  }
}

// ---------- Espace joueur ----------

async function loadPlayerData() {
  if (!state.compte.joueur_id) return;
  [state.myCharacters, state.party] = await Promise.all([api('/api/me/characters'), api('/api/me/party')]);
}

function renderPlayer() {
  const list = $('#my-character-list');
  list.replaceChildren(...state.myCharacters.map(characterCard));
  if (state.myCharacters.length === 0) {
    list.append(element('p', 'roster-empty', 'Aucun personnage ne t’est encore attribué. Demande à ton MJ de t’en créer un.'));
  }
  $('#mine-count').textContent = plural(state.myCharacters.length, 'personnage');
  populateSelect($('#my-roll-form select[name="personnage_id"]'),
    state.myCharacters.filter((character) => character.statut !== 'mort')
      .map((character) => ({ id: character.id, nom: character.nom })),
    { placeholder: 'Choisir un personnage' });

  const campaigns = [...new Map(state.myCharacters.map((character) =>
    [character.campagne_id, { id: character.campagne_id, nom: character.campagne_nom }])).values()];
  populateSelect($('#party-campaign'), campaigns);
  renderParty();
}

function renderParty() {
  const campaignId = Number($('#party-campaign').value);
  renderRoster($('#party-roster'), state.party.filter((character) => character.campagne_id === campaignId),
    { highlightPlayer: state.compte.joueur_id });
}

// ---------- Table du MJ ----------

async function loadGmData() {
  if (!isMj()) return;
  state.gmCharacters = await api('/api/gm/characters');
}

function renderGm() {
  const campaigns = managedCampaigns();
  if (!campaigns.some((campaign) => campaign.id === state.selectedCampaign)) {
    state.selectedCampaign = campaigns.find((campaign) => campaign.active)?.id ?? campaigns[0]?.id ?? null;
  }
  $('#gm-eyebrow').textContent = isAdmin() ? 'ADMINISTRATION' : 'TABLE DU MJ';

  const picker = $('#campaign-picker');
  picker.replaceChildren();
  for (const campaign of campaigns) {
    const count = state.gmCharacters.filter((character) => character.campagne_id === campaign.id).length;
    const button = element('button', `picker-item${campaign.active ? '' : ' is-archived'}`);
    button.type = 'button';
    button.dataset.campaign = campaign.id;
    if (campaign.id === state.selectedCampaign) button.setAttribute('aria-current', 'true');
    button.append(element('strong', '', campaign.nom),
      element('small', '', `${campaign.univers} · ${plural(count, 'perso')}${campaign.active ? '' : ' · terminée'}`));
    picker.append(button);
  }

  const detail = $('#campaign-detail');
  const campaign = campaigns.find((item) => item.id === state.selectedCampaign);
  detail.hidden = !campaign;
  if (!campaign) {
    picker.append(element('p', 'roster-empty', 'Tu ne mènes encore aucune campagne. Ouvre-en une dans l’onglet « Créer ».'));
    return;
  }
  const characters = state.gmCharacters.filter((character) => character.campagne_id === campaign.id);
  const npcCount = characters.filter((character) => !character.joueur_id).length;
  $('#detail-name').textContent = campaign.nom;
  const mj = state.references.joueurs.find((player) => player.id === campaign.mj_id)?.pseudo;
  $('#detail-meta').textContent = [
    campaign.univers, `depuis le ${formatDate(campaign.debut)}`, isAdmin() && mj ? `MJ : ${mj}` : null,
    `${characters.length - npcCount} personnage${characters.length - npcCount === 1 ? ' joueur' : 's joueurs'}, ${npcCount} PNJ`,
    campaign.active ? 'en cours' : 'terminée'
  ].filter(Boolean).join(' · ');
  $('#detail-toggle').textContent = campaign.active ? 'Clôturer la campagne' : 'Rouvrir la campagne';
  $('#xp-form').querySelector('button').disabled = !campaign.active;

  populateSelect($('#roll-form select[name="personnage_id"]'),
    characters.filter((character) => character.statut !== 'mort').map((character) => ({ id: character.id, nom: character.nom })),
    { placeholder: 'Personnage' });
  renderGmRoster();
}

function renderGmRoster() {
  const search = $('#roster-search').value.trim().toLowerCase();
  const characters = state.gmCharacters.filter((character) => character.campagne_id === state.selectedCampaign &&
    (!search || character.nom.toLowerCase().includes(search) || (character.joueur_pseudo || 'pnj').toLowerCase().includes(search)));
  $('#roster-count').textContent = plural(characters.length, 'personnage');
  renderRoster($('#gm-roster'), characters, { withHpControls: true });
}

function fillCreateForms() {
  const players = state.references.joueurs.map(({ id, pseudo }) => ({ id, nom: pseudo }));
  populateSelect($('#campaign-form select[name="mj_id"]'), players, { placeholder: 'Choisir un joueur' });
  populateSelect($('#character-form select[name="joueur_id"]'), players, { placeholder: 'PNJ / aucun' });
  populateSelect($('#character-form select[name="race_id"]'), state.references.races, { placeholder: 'Choisir une race' });
  populateSelect($('#character-form select[name="classe_id"]'), state.references.classes, { placeholder: 'Choisir une classe' });
  populateSelect($('#character-form select[name="campagne_id"]'),
    managedCampaigns().filter((campaign) => campaign.active), { placeholder: 'Choisir une campagne' });
  // Un MJ ouvre toujours la campagne à son nom : seul l'admin choisit.
  $('#mj-choice').hidden = !isAdmin();
  $('#campaign-form select[name="mj_id"]').disabled = !isAdmin();
}

async function adjustHp(characterId, delta) {
  try {
    await api(`/api/gm/characters/${characterId}/pv`, {
      method: 'POST',
      body: { delta, motif: delta < 0 ? 'Dégâts' : 'Soin' }
    });
    await Promise.all([loadGmData(), loadPlayerData()]);
    renderGm();
    if (hasPlayerSpace()) renderPlayer();
    notice('Points de vie mis à jour.');
  } catch (error) {
    notice(error.message, true);
  }
}

// ---------- Comptes (admin) ----------

async function loadAccounts() {
  if (!isAdmin()) return;
  state.accounts = await api('/api/admin/accounts');
}

function renderAccounts() {
  const list = $('#account-list');
  list.replaceChildren();
  $('#account-count').textContent = plural(state.accounts.length, 'compte');
  for (const account of state.accounts) {
    const isSelf = account.id === state.compte.id;
    const row = element('div', `account-row${account.actif ? '' : ' account-disabled'}`);
    const identity = element('div');
    const title = element('strong', '', account.identifiant);
    title.append(element('span', 'role-badge', roleLabels[account.role]));
    identity.append(title, element('small', '',
      `${account.pseudo ? `Joueur : ${account.pseudo}` : 'Non relié à un joueur'}${account.actif ? '' : ' · désactivé'}${isSelf ? ' · toi' : ''}`));

    const actions = element('div', 'account-actions');
    const role = document.createElement('select');
    role.dataset.accountRole = account.id;
    role.setAttribute('aria-label', `Rôle de ${account.identifiant}`);
    for (const [value, label] of Object.entries(roleLabels)) role.append(new Option(label, value));
    role.value = account.role;
    role.disabled = isSelf;
    const toggle = element('button', 'button button-small', account.actif ? 'Désactiver' : 'Réactiver');
    toggle.type = 'button';
    toggle.dataset.accountToggle = account.id;
    toggle.dataset.nextActive = String(!account.actif);
    toggle.disabled = isSelf;
    const reset = element('button', 'button button-small', 'Mot de passe');
    reset.type = 'button';
    reset.dataset.accountPassword = account.id;
    const remove = element('button', 'button button-small button-danger', 'Supprimer');
    remove.type = 'button';
    remove.dataset.accountDelete = account.id;
    remove.disabled = isSelf;
    actions.append(role, toggle, reset, remove);
    row.append(identity, actions);
    list.append(row);
  }

  const select = $('#account-form select[name="joueur_id"]');
  const linked = new Set(state.accounts.map((account) => account.joueur_id));
  populateSelect(select, state.references.joueurs.filter((player) => !linked.has(player.id))
    .map(({ id, pseudo }) => ({ id, nom: pseudo })), { placeholder: 'Aucun (admin seulement)' });
  select.append(new Option('＋ Nouveau joueur…', 'nouveau'));
  $('#new-pseudo').hidden = select.value !== 'nouveau';
}

async function refreshAccounts(message, isError = false) {
  try {
    await loadAccounts();
    renderAccounts();
  } catch (error) {
    notice(error.message, true);
    return;
  }
  if (message) notice(message, isError);
}

// ---------- Événements ----------

function bindEvents() {
  $('#tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-view]');
    if (!tab) return;
    event.preventDefault();
    showView(tab.dataset.view);
  });

  $('#logout').addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // La session est fermée localement même si l'API ne répond pas.
    }
    saveToken('');
    location.replace('/login.html');
  });

  for (const [formSelector, path, resultSelector] of [
    ['#roll-form', '/api/gm/rolls', '#roll-result'],
    ['#my-roll-form', '/api/me/rolls', '#my-roll-result']
  ]) {
    $(formSelector).addEventListener('submit', async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const name = event.currentTarget.querySelector('select[name="personnage_id"]').selectedOptions[0]?.textContent;
      try {
        const result = await api(path, {
          method: 'POST',
          body: {
            personnage_id: Number(values.personnage_id),
            type_jet: values.type_jet,
            faces: Number(values.faces),
            carac: values.carac
          }
        });
        $(resultSelector).textContent = `${name} · ${values.type_jet} (d${values.faces}) : ${result.total}`;
      } catch (error) {
        $(resultSelector).textContent = error.message;
      }
    });
  }

  $('#party-campaign').addEventListener('change', renderParty);

  $('#campaign-picker').addEventListener('click', (event) => {
    const item = event.target.closest('[data-campaign]');
    if (!item) return;
    state.selectedCampaign = Number(item.dataset.campaign);
    $('#roster-search').value = '';
    $('#roll-result').textContent = '';
    renderGm();
  });

  $('#roster-search').addEventListener('input', renderGmRoster);

  $('#gm-roster').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-hp]');
    if (!button) return;
    const actions = button.closest('[data-character]');
    const amount = Number(actions.querySelector('.hp-amount').value);
    if (!Number.isInteger(amount) || amount < 1) {
      notice('Saisis un nombre entier de PV supérieur à zéro.', true);
      return;
    }
    await adjustHp(actions.dataset.character, button.dataset.hp === '-' ? -amount : amount);
  });

  $('#detail-toggle').addEventListener('click', async () => {
    const campaign = state.campaigns.find((item) => item.id === state.selectedCampaign);
    try {
      await api(`/api/gm/campaigns/${campaign.id}`, { method: 'PATCH', body: { active: !campaign.active } });
      state.campaigns = await api('/api/campaigns');
      renderGm();
      fillCreateForms();
      notice(campaign.active ? 'Campagne clôturée.' : 'Campagne rouverte.');
    } catch (error) {
      notice(error.message, true);
    }
  });

  $('#xp-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const xp = Number(new FormData(event.currentTarget).get('xp'));
    try {
      await api(`/api/gm/campaigns/${state.selectedCampaign}/xp`, { method: 'POST', body: { xp } });
      await loadGmData();
      renderGm();
      notice(`${xp} XP donnés à chaque personnage en vie.`);
    } catch (error) {
      notice(error.message, true);
    }
  });

  const characterForm = $('#character-form');
  characterForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = characterForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(characterForm));
      for (const key of ['joueur_id', 'campagne_id', 'race_id', 'classe_id', 'niveau', 'xp', 'force',
        'dexterite', 'constitution', 'intelligence', 'sagesse', 'charisme', 'pv_max', 'pv_actuels', 'classe_armure']) {
        values[key] = values[key] === '' && key === 'joueur_id' ? null : Number(values[key]);
      }
      await api('/api/gm/characters', { method: 'POST', body: values });
      characterForm.reset();
      await Promise.all([loadGmData(), loadPlayerData()]);
      state.selectedCampaign = values.campagne_id;
      renderGm();
      if (hasPlayerSpace()) renderPlayer();
      showView('campagnes');
      notice(`${values.nom} a rejoint la campagne.`);
    } catch (error) {
      notice(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  const campaignForm = $('#campaign-form');
  campaignForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = campaignForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(campaignForm));
      if (values.mj_id !== undefined) values.mj_id = Number(values.mj_id);
      const created = await api('/api/gm/campaigns', { method: 'POST', body: values });
      campaignForm.reset();
      state.campaigns = await api('/api/campaigns');
      state.selectedCampaign = created.id;
      fillCreateForms();
      renderGm();
      showView('campagnes');
      notice(`Campagne « ${created.nom} » ouverte.`);
    } catch (error) {
      notice(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  const accountForm = $('#account-form');
  accountForm.querySelector('select[name="joueur_id"]').addEventListener('change', (event) => {
    $('#new-pseudo').hidden = event.target.value !== 'nouveau';
  });
  accountForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = accountForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(accountForm));
      const body = { identifiant: values.identifiant, mot_de_passe: values.mot_de_passe, role: values.role };
      if (values.joueur_id === 'nouveau') body.nouveau_pseudo = values.nouveau_pseudo;
      else if (values.joueur_id) body.joueur_id = Number(values.joueur_id);
      await api('/api/admin/accounts', { method: 'POST', body });
      accountForm.reset();
      // Un nouveau joueur a pu être créé : on recharge aussi les références.
      state.references = await api('/api/references');
      fillCreateForms();
      await refreshAccounts(`Compte « ${body.identifiant.toLowerCase()} » créé.`);
    } catch (error) {
      notice(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  const accountList = $('#account-list');
  async function updateAccount(id, body, message) {
    try {
      await api(`/api/admin/accounts/${id}`, { method: 'PATCH', body });
      await refreshAccounts(message);
    } catch (error) {
      await refreshAccounts(error.message, true);
    }
  }
  accountList.addEventListener('change', async (event) => {
    const select = event.target.closest('[data-account-role]');
    if (select) await updateAccount(select.dataset.accountRole, { role: select.value }, 'Rôle mis à jour.');
  });
  accountList.addEventListener('click', async (event) => {
    const toggle = event.target.closest('[data-account-toggle]');
    if (toggle) {
      const active = toggle.dataset.nextActive === 'true';
      await updateAccount(toggle.dataset.accountToggle, { actif: active }, active ? 'Compte réactivé.' : 'Compte désactivé.');
      return;
    }
    const reset = event.target.closest('[data-account-password]');
    if (reset) {
      const secret = prompt('Nouveau mot de passe (10 caractères minimum) :');
      if (secret) await updateAccount(reset.dataset.accountPassword, { mot_de_passe: secret }, 'Mot de passe changé.');
      return;
    }
    const remove = event.target.closest('[data-account-delete]');
    if (remove && confirm('Supprimer définitivement ce compte ? Le joueur et ses personnages sont conservés.')) {
      try {
        await api(`/api/admin/accounts/${remove.dataset.accountDelete}`, { method: 'DELETE' });
        await refreshAccounts('Compte supprimé.');
      } catch (error) {
        notice(error.message, true);
      }
    }
  });
}

async function initialize() {
  if (!getToken()) {
    location.replace('/login.html');
    return;
  }
  try {
    state.compte = await api('/api/auth/me');
    const [campaigns, references] = await Promise.all([api('/api/campaigns'), api('/api/references')]);
    state.campaigns = campaigns;
    state.references = references;
    await Promise.all([loadPlayerData(), loadGmData(), loadAccounts()]);
  } catch (error) {
    notice(`Impossible de charger le Grimoire : ${error.message}`, true);
    return;
  }

  const name = $('#account-name');
  name.append(element('b', '', state.compte.pseudo || state.compte.identifiant), element('small', '', roleLabels[state.compte.role]));
  bindEvents();
  if (hasPlayerSpace()) renderPlayer();
  if (isMj()) {
    renderGm();
    fillCreateForms();
  }
  if (isAdmin()) renderAccounts();
  showView(location.hash.slice(1));
}

initialize();
