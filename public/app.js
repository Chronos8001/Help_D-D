const state = {
  campaigns: [],
  characters: [],
  references: { joueurs: [], races: [], classes: [] },
  mjToken: sessionStorage.getItem('grimoire-mj-token') || '',
  isMj: false
};

const $ = (selector) => document.querySelector(selector);
const apiBaseUrl = (window.GRIMOIRE_API_URL || '').replace(/\/+$/, '');

async function api(path, { method = 'GET', body, token = state.mjToken } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'La requête a échoué.');
  return result.data;
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function notice(message, isError = false) {
  const node = $('#notice');
  node.textContent = message;
  node.classList.toggle('error', isError);
}

function populateSelect(select, items, { placeholder, valueKey = 'id', labelKey = 'nom' } = {}) {
  const existing = select.value;
  select.replaceChildren();
  if (placeholder !== undefined) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = placeholder;
    select.append(option);
  }
  for (const item of items) {
    const option = document.createElement('option');
    option.value = item[valueKey];
    option.textContent = item[labelKey];
    select.append(option);
  }
  if ([...select.options].some((option) => option.value === existing)) select.value = existing;
}

function fillCampaignControls() {
  const filter = $('#campaign-filter');
  const currentFilter = filter.value;
  filter.replaceChildren(new Option('Toutes les campagnes', ''));
  state.campaigns.forEach((campaign) => {
    filter.append(new Option(campaign.nom, campaign.id));
  });
  if ([...filter.options].some((option) => option.value === currentFilter)) filter.value = currentFilter;

  document.querySelectorAll('[data-campaign-options]').forEach((select) => {
    populateSelect(select, state.campaigns.filter((campaign) => campaign.active), {
      placeholder: 'Choisir une campagne'
    });
  });

  const list = $('#campaign-list');
  list.replaceChildren();
  $('#campaign-count').textContent = `${state.campaigns.length} monde${state.campaigns.length === 1 ? '' : 's'}`;
  for (const [index, campaign] of state.campaigns.entries()) {
    const card = element('button', `campaign-card${campaign.active ? '' : ' campaign-archived'}`);
    card.type = 'button';
    card.dataset.campaign = campaign.id;
    const icon = element('span', 'campaign-icon', ['✧', '⌖', '✳', '⌘'][index % 4]);
    const title = element('strong', '', campaign.nom);
    const universe = element('span', 'campaign-universe', campaign.univers);
    card.append(icon, title, universe);
    if (!campaign.active) card.append(element('span', 'campaign-state', 'Terminée'));
    if (state.isMj) {
      const toggle = element('span', 'campaign-toggle', campaign.active ? 'Clôturer' : 'Réactiver');
      toggle.dataset.toggleCampaign = campaign.id;
      toggle.dataset.nextActive = String(!campaign.active);
      card.append(toggle);
    }
    card.addEventListener('click', (event) => {
      if (event.target.closest('[data-toggle-campaign]')) return;
      $('#campaign-filter').value = String(campaign.id);
      loadCharacters();
      $('#aventuriers').scrollIntoView({ behavior: 'smooth' });
    });
    list.append(card);
  }
  fillFormReferences();
}

function fillFormReferences() {
  const playerOptions = state.references.joueurs.map(({ id, pseudo }) => ({ id, nom: pseudo }));
  const campaignOptions = state.campaigns.filter((campaign) => campaign.active);
  document.querySelectorAll('#campaign-form select[name="mj_id"]').forEach((select) => {
    populateSelect(select, playerOptions, { placeholder: 'Choisir un joueur' });
  });
  document.querySelectorAll('#character-form select[name="joueur_id"]').forEach((select) => {
    populateSelect(select, playerOptions, { placeholder: 'PNJ / aucun' });
  });
  document.querySelectorAll('#character-form select[name="race_id"]').forEach((select) => {
    populateSelect(select, state.references.races, { placeholder: 'Choisir une race' });
  });
  document.querySelectorAll('#character-form select[name="classe_id"]').forEach((select) => {
    populateSelect(select, state.references.classes, { placeholder: 'Choisir une classe' });
  });
  const activeCampaigns = campaignOptions;
  document.querySelectorAll('[data-campaign-options]').forEach((select) => {
    populateSelect(select, activeCampaigns, { placeholder: 'Choisir une campagne' });
  });
}

function renderCharacters() {
  const list = $('#character-list');
  list.replaceChildren();
  const characters = state.characters;
  if (characters.length === 0) {
    notice('Aucun personnage dans cette campagne pour le moment.');
    return;
  }
  notice(`${characters.length} personnage${characters.length === 1 ? '' : 's'} dans le grimoire.`);
  for (const character of characters) {
    const card = element('article', 'character-card');
    const top = element('div', 'character-top');
    const emblem = element('span', 'character-emblem', character.classe_nom?.slice(0, 1) || '✦');
    const identity = element('div', 'character-identity');
    identity.append(element('h3', '', character.nom));
    identity.append(element('p', 'character-subtitle', `${character.race_nom} · ${character.classe_nom}`));
    top.append(emblem, identity, element('span', `status status-${character.statut}`, character.statut));
    const campaign = element('p', 'character-campaign', character.campagne_nom);
    const bar = element('div', 'hp-line');
    const hpText = element('span', '', `PV ${character.pv_actuels} / ${character.pv_max}`);
    const track = element('span', 'hp-track');
    const fill = element('span', 'hp-fill');
    fill.style.width = `${Math.max(0, Math.min(100, character.pv_actuels / character.pv_max * 100))}%`;
    if (character.pv_actuels / character.pv_max < 0.3) fill.classList.add('hp-low');
    track.append(fill);
    bar.append(hpText, track);
    const stats = element('div', 'stat-row');
    for (const [label, value] of [
      ['NIV', character.niveau], ['FOR', character.force], ['DEX', character.dexterite],
      ['CON', character.constitution], ['INT', character.intelligence],
      ['SAG', character.sagesse], ['CHA', character.charisme]
    ]) {
      const stat = element('span', 'stat');
      stat.append(element('small', '', label), element('b', '', String(value)));
      stats.append(stat);
    }
    const footer = element('div', 'character-footer');
    footer.append(element('span', '', character.joueur_pseudo || 'Personnage non attribué'));
    footer.append(element('span', '', `CA ${character.classe_armure}`));
    card.append(top, campaign, bar, stats, footer);
    if (state.isMj) {
      const controls = element('div', 'card-actions');
      const damage = element('button', 'button button-small', '− Dégâts');
      damage.type = 'button';
      damage.dataset.adjustHp = String(character.id);
      damage.dataset.delta = '-';
      const heal = element('button', 'button button-small', '+ Soin');
      heal.type = 'button';
      heal.dataset.adjustHp = String(character.id);
      heal.dataset.delta = '+';
      controls.append(damage, heal);
      card.append(controls);
    }
    list.append(card);
  }
}

async function loadCharacters() {
  notice('Chargement des personnages…');
  const campaignId = $('#campaign-filter').value;
  const query = campaignId ? `?campagneId=${encodeURIComponent(campaignId)}` : '';
  try {
    state.characters = await api(`${state.isMj ? '/api/gm/characters' : '/api/characters'}${query}`);
    renderCharacters();
    refreshCharacterOptions();
  } catch (error) {
    notice(error.message, true);
  }
}

function refreshCharacterOptions() {
  const characters = state.characters.map((character) => ({
    id: character.id,
    nom: `${character.nom} · ${character.campagne_nom}`
  }));
  document.querySelectorAll('#roll-form select[name="personnage_id"], #pv-form select[name="personnage_id"]').forEach((select) => {
    populateSelect(select, characters, { placeholder: 'Choisir un personnage' });
  });
}

async function loadBaseData() {
  const [campaigns, references] = await Promise.all([api('/api/campaigns'), api('/api/references')]);
  state.campaigns = campaigns;
  state.references = references;
  fillCampaignControls();
}

async function setMjMode(token) {
  state.mjToken = token;
  try {
    await api('/api/gm/characters');
    state.isMj = true;
    sessionStorage.setItem('grimoire-mj-token', token);
    $('#gm-panel').hidden = false;
    $('#open-mj-panel').textContent = 'Mode MJ activé';
    fillCampaignControls();
    await loadCharacters();
    $('#gm-panel').scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    state.mjToken = '';
    state.isMj = false;
    sessionStorage.removeItem('grimoire-mj-token');
    throw error;
  }
}

function bindForms() {
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
      await loadCharacters();
      notice('Personnage ajouté au grimoire.');
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
      values.mj_id = Number(values.mj_id);
      await api('/api/gm/campaigns', { method: 'POST', body: values });
      campaignForm.reset();
      await loadBaseData();
      await loadCharacters();
      notice('Campagne créée.');
    } catch (error) {
      notice(error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  $('#roll-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await api('/api/gm/rolls', {
        method: 'POST',
        body: {
          personnage_id: Number(values.personnage_id),
          type_jet: values.type_jet,
          faces: Number(values.faces),
          carac: values.carac
        }
      });
      $('#roll-result').textContent = `Résultat total : ${result.total}`;
    } catch (error) {
      $('#roll-result').textContent = error.message;
    }
  });

  $('#xp-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(`/api/gm/campaigns/${values.campagne_id}/xp`, {
        method: 'POST',
        body: { xp: Number(values.xp) }
      });
      await loadCharacters();
      notice('XP distribuée aux personnages de la campagne.');
    } catch (error) {
      notice(error.message, true);
    }
  });

  $('#pv-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await adjustHp(values.personnage_id, Number(values.delta), values.motif);
  });

  $('#gm-panel').addEventListener('click', async (event) => {
    const toggle = event.target.closest('[data-toggle-campaign]');
    if (toggle) {
      try {
        await api(`/api/gm/campaigns/${toggle.dataset.toggleCampaign}`, {
          method: 'PATCH', body: { active: toggle.dataset.nextActive === 'true' }
        });
        await loadBaseData();
      } catch (error) {
        notice(error.message, true);
      }
      return;
    }
    const button = event.target.closest('[data-adjust-hp]');
    if (button) {
      const raw = prompt(button.dataset.delta === '-' ? 'Combien de dégâts ?' : 'Combien de PV soigner ?');
      if (raw === null) return;
      const amount = Number(raw);
      if (!Number.isInteger(amount) || amount < 1) {
        notice('Saisis un nombre entier de PV supérieur à zéro.', true);
        return;
      }
      const motif = prompt('Motif (optionnel) :') || '';
      await adjustHp(button.dataset.adjustHp, amount * (button.dataset.delta === '-' ? -1 : 1), motif);
    }
  });
}

async function adjustHp(characterId, delta, motif) {
  try {
    await api(`/api/gm/characters/${characterId}/pv`, {
      method: 'POST',
      body: { delta, motif: motif || 'Modification depuis le Grimoire' }
    });
    await loadCharacters();
    notice('Points de vie mis à jour.');
  } catch (error) {
    notice(error.message, true);
  }
}

function bindLogin() {
  const dialog = $('#mj-dialog');
  $('#open-mj-panel').addEventListener('click', () => {
    if (state.isMj) {
      $('#gm-panel').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    dialog.showModal();
  });
  $('#close-mj-dialog').addEventListener('click', () => dialog.close());
  $('#mj-login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const token = new FormData(event.currentTarget).get('token');
    try {
      await setMjMode(token);
      $('#login-error').textContent = '';
      dialog.close();
      event.currentTarget.reset();
    } catch (error) {
      $('#login-error').textContent = error.message;
    }
  });
  $('#logout-mj').addEventListener('click', async () => {
    state.mjToken = '';
    state.isMj = false;
    sessionStorage.removeItem('grimoire-mj-token');
    $('#gm-panel').hidden = true;
    $('#open-mj-panel').textContent = 'Accès maître du jeu ↗';
    fillCampaignControls();
    await loadCharacters();
  });
}

$('#campaign-filter').addEventListener('change', loadCharacters);
$('#campaign-list').addEventListener('click', async (event) => {
  const toggle = event.target.closest('[data-toggle-campaign]');
  if (!toggle || !state.isMj) return;
  try {
    await api(`/api/gm/campaigns/${toggle.dataset.toggleCampaign}`, {
      method: 'PATCH', body: { active: toggle.dataset.nextActive === 'true' }
    });
    await loadBaseData();
  } catch (error) {
    notice(error.message, true);
  }
});

async function initialize() {
  bindLogin();
  bindForms();
  try {
    await loadBaseData();
    if (state.mjToken) {
      try {
        await setMjMode(state.mjToken);
      } catch {
        state.mjToken = '';
      }
    }
    await loadCharacters();
  } catch (error) {
    notice(`Impossible de charger le Grimoire : ${error.message}`, true);
  }
}

initialize();
