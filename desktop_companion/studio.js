const state = {
  snapshot: null,
  recording: null,
  avatarLibrary: [],
  quickAvatars: [],
  bridgeHealthTimer: null,
  characterData: null,
  characterScenes: [],
  savedPresets: [],
  skinPackages: [],
  activeCharTab: 'select',
};

const elements = {};

function $(id) {
  return document.getElementById(id);
}

function bindElements() {
  Object.assign(elements, {
    profileSelect: $('profileSelect'),
    profileMeta: $('profileMeta'),
    profileBadge: $('profileBadge'),
    createProfileButton: $('createProfileButton'),
    duplicateProfileButton: $('duplicateProfileButton'),
    deleteProfileButton: $('deleteProfileButton'),
    importProfileButton: $('importProfileButton'),
    exportProfileButton: $('exportProfileButton'),
    saveProfileButton: $('saveProfileButton'),
    saveAppButton: $('saveAppButton'),
    focusWidgetButton: $('focusWidgetButton'),
    quickAvatarSelect: $('quickAvatarSelect'),
    quickAvatarMeta: $('quickAvatarMeta'),
    bridgeUrl: $('bridgeUrl'),
    avatarLibraryRoot: $('avatarLibraryRoot'),
    avatarLibraryRootLabel: $('avatarLibraryRootLabel'),
    avatarLibraryCount: $('avatarLibraryCount'),
    pickAvatarRootButton: $('pickAvatarRootButton'),
    scanAvatarLibraryButton: $('scanAvatarLibraryButton'),
    profileName: $('profileName'),
    avatarName: $('avatarName'),
    interlocutorName: $('interlocutorName'),
    avatarAge: $('avatarAge'),
    interlocutorAge: $('interlocutorAge'),
    identityRole: $('identityRole'),
    relationship: $('relationship'),
    styleKeywords: $('styleKeywords'),
    biography: $('biography'),
    identityNotes: $('identityNotes'),
    agentUrl: $('agentUrl'),
    model: $('model'),
    temperature: $('temperature'),
    temperatureValue: $('temperatureValue'),
    ttsProvider: $('ttsProvider'),
    ttsVoice: $('ttsVoice'),
    sttLanguage: $('sttLanguage'),
    autoSpeak: $('autoSpeak'),
    autoSendVoice: $('autoSendVoice'),
    widgetWidth: $('widgetWidth'),
    widgetWidthValue: $('widgetWidthValue'),
    widgetHeight: $('widgetHeight'),
    widgetHeightValue: $('widgetHeightValue'),
    widgetScale: $('widgetScale'),
    widgetScaleValue: $('widgetScaleValue'),
    widgetOpacity: $('widgetOpacity'),
    widgetOpacityValue: $('widgetOpacityValue'),
    accentColor: $('accentColor'),
    alwaysOnTop: $('alwaysOnTop'),
    clickThrough: $('clickThrough'),
    showStatus: $('showStatus'),
    showTranscript: $('showTranscript'),
    systemPrompt: $('systemPrompt'),
    conversationStyle: $('conversationStyle'),
    initiative: $('initiative'),
    humor: $('humor'),
    expressiveness: $('expressiveness'),
    behaviorTraits: $('behaviorTraits'),
    boundaries: $('boundaries'),
    greeting: $('greeting'),
    farewell: $('farewell'),
    memorySummary: $('memorySummary'),
    memoryPinnedNotes: $('memoryPinnedNotes'),
    memoryKnownFacts: $('memoryKnownFacts'),
    memoryPrivateNotes: $('memoryPrivateNotes'),
    permissionPcControl: $('permissionPcControl'),
    permissionScreenRead: $('permissionScreenRead'),
    permissionWebcam: $('permissionWebcam'),
    permissionFileAccess: $('permissionFileAccess'),
    permissionBrowserAutomation: $('permissionBrowserAutomation'),
    permissionMicrophone: $('permissionMicrophone'),
    permissionNotifications: $('permissionNotifications'),
    characterGrid: $('characterGrid'),
    charTabSelect: $('charTabSelect'),
    charTabOutfit: $('charTabOutfit'),
    charTabBody: $('charTabBody'),
    charTabPresets: $('charTabPresets'),
    outfitActiveCharacter: $('outfitActiveCharacter'),
    outfitCategories: $('outfitCategories'),
    skinPackSection: $('skinPackSection'),
    skinPackGrid: $('skinPackGrid'),
    morphActiveCharacter: $('morphActiveCharacter'),
    morphCategories: $('morphCategories'),
    presetSaveName: $('presetSaveName'),
    savePresetButton: $('savePresetButton'),
    savedPresetList: $('savedPresetList'),
    charPreviewThumb: $('charPreviewThumb'),
    charPreviewMeta: $('charPreviewMeta'),
    charPreviewOutfitSummary: $('charPreviewOutfitSummary'),
    bridgeHealth: $('bridgeHealth'),
    chatStatus: $('chatStatus'),
    chatLog: $('chatLog'),
    recentMemoryCount: $('recentMemoryCount'),
    recordButton: $('recordButton'),
    recordStatus: $('recordStatus'),
    chatInput: $('chatInput'),
    sendButton: $('sendButton'),
  });
}

function activeProfile() {
  return state.snapshot?.activeProfile || null;
}

function setSliderBadge(input, output, suffix = '') {
  if (!input || !output) return;
  output.textContent = `${input.value}${suffix}`;
}

function requirePermission(permissionValue, capabilityLabel) {
  const mode = String(permissionValue || 'ask').toLowerCase();
  if (mode === 'deny') {
    setChatStatus(`${capabilityLabel} bloccato dal profilo`);
    return false;
  }
  if (mode === 'ask') {
    const approved = window.confirm(`${capabilityLabel}: questo profilo richiede conferma. Vuoi procedere?`);
    if (!approved) {
      setChatStatus(`${capabilityLabel} annullato`);
      return false;
    }
  }
  return true;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Note: innerHTML usage below is safe — all interpolated values pass through
// escapeHtml() and data sources are local VAM scene files, not web input.

/* ─── Character Panel ─── */

function switchCharTab(tabName) {
  state.activeCharTab = tabName;
  document.querySelectorAll('.char-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.charTab === tabName);
  });
  document.querySelectorAll('.char-tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.charPanel === tabName);
  });
}

function buildCharacterCardHtml(scene, index, selected) {
  const thumbSrc = scene.previewImage
    ? encodeURI(`file:///${scene.previewImage.replace(/\\/g, '/')}`)
    : '';
  const thumbContent = thumbSrc
    ? '<img src="' + thumbSrc + '" alt="' + escapeHtml(scene.name) + '" />'
    : '<div class="avatar-preview-fallback-core small"></div>';
  const selectedClass = selected ? ' selected' : '';

  const card = document.createElement('article');
  card.className = 'character-card-item' + selectedClass;
  card.dataset.sceneIndex = String(index);

  const thumbDiv = document.createElement('div');
  thumbDiv.className = 'character-card-thumb';
  thumbDiv.textContent = '';
  if (thumbSrc) {
    const img = document.createElement('img');
    img.src = thumbSrc;
    img.alt = scene.name || '';
    thumbDiv.appendChild(img);
  } else {
    const fallback = document.createElement('div');
    fallback.className = 'avatar-preview-fallback-core small';
    thumbDiv.appendChild(fallback);
  }

  const bodyDiv = document.createElement('div');
  bodyDiv.className = 'character-card-body';
  const h4 = document.createElement('h4');
  h4.textContent = scene.characterName || scene.name || '';
  const countsSpan = document.createElement('span');
  countsSpan.className = 'character-card-counts';
  const clothing = scene.appearance?.counts?.clothing || 0;
  const hair = scene.appearance?.counts?.hair || 0;
  const morphs = scene.appearance?.counts?.morphs || 0;
  countsSpan.textContent = `Abiti ${clothing} · Capelli ${hair} · Morph ${morphs}`;
  bodyDiv.appendChild(h4);
  bodyDiv.appendChild(countsSpan);

  card.appendChild(thumbDiv);
  card.appendChild(bodyDiv);
  return card;
}

function renderCharacterGrid(scenes) {
  state.characterScenes = scenes;
  elements.avatarLibraryCount.textContent = `${scenes.length} personaggi trovati`;

  elements.characterGrid.textContent = '';

  if (!scenes.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Premi "Scansiona scene" per trovare personaggi VAM.';
    elements.characterGrid.appendChild(empty);
    return;
  }

  const preset = activeProfile()?.characterPreset;
  scenes.forEach((scene, i) => {
    const selected = preset?.sourceScene && preset.sourceScene === scene.sceneFile;
    const card = buildCharacterCardHtml(scene, i, selected);
    card.addEventListener('click', () => {
      const s = state.characterScenes[i];
      if (s) void selectCharacter(s);
    });
    elements.characterGrid.appendChild(card);
  });
}

async function selectCharacter(scene) {
  const profile = activeProfile();
  if (!profile) return;

  setChatStatus(`Caricamento ${scene.name}...`);
  const charData = await window.gemcodeCompanion.getCharacterData(scene.sceneFile);
  state.characterData = charData;

  const clothing = (charData.clothing || []).map(c => ({
    id: c.id,
    name: c.name,
    enabled: c.enabled !== false,
    category: c.category || 'accessori',
  }));
  const hair = (charData.hair || []).map(h => ({
    id: h.id,
    name: h.name,
    enabled: h.enabled !== false,
  }));
  const morphOverrides = {};
  if (charData.morphs?.items) {
    for (const m of charData.morphs.items) {
      if (m.value !== 0) morphOverrides[m.name] = m.value;
    }
  }

  const characterPreset = {
    sourceScene: scene.sceneFile,
    characterBase: charData.characterBase || charData.name || '',
    skinPackage: profile.characterPreset?.skinPackage || '',
    clothing,
    hair,
    morphOverrides,
    skinColor: charData.skinColor || { h: 0, s: 0, v: 1 },
  };

  const snapshot = await window.gemcodeCompanion.updateProfile(profile.id, { characterPreset });
  renderSnapshot(snapshot);
  renderCharacterGrid(state.characterScenes);
  renderOutfitPanel(charData, characterPreset);
  renderMorphPanel(charData, characterPreset);
  updateCharPreviewBar(charData, characterPreset);
  switchCharTab('outfit');
  setChatStatus(`Personaggio selezionato: ${charData.characterBase || charData.name}`);
}

function buildOutfitToggleItem(labelText, dataAttr, dataValue, checked) {
  const label = document.createElement('label');
  label.className = 'outfit-toggle-item';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.dataset[dataAttr] = String(dataValue);
  cb.checked = checked;
  const span = document.createElement('span');
  span.textContent = labelText;
  label.appendChild(cb);
  label.appendChild(span);
  return label;
}

function buildCollapsibleSection(title, sectionKey, items, buildItemFn) {
  const section = document.createElement('div');
  section.className = 'outfit-section';

  const head = document.createElement('h3');
  head.className = 'outfit-section-head collapsible';
  head.dataset.section = sectionKey;
  head.textContent = title;

  const grid = document.createElement('div');
  grid.className = 'outfit-toggle-grid';
  grid.dataset.sectionBody = sectionKey;

  items.forEach((item, i) => grid.appendChild(buildItemFn(item, i)));

  head.addEventListener('click', () => {
    grid.classList.toggle('collapsed');
    head.classList.toggle('collapsed');
  });

  section.appendChild(head);
  section.appendChild(grid);
  return section;
}

function renderOutfitPanel(charData, preset) {
  const charLabel = elements.outfitActiveCharacter.querySelector('.outfit-char-label');
  if (charLabel) charLabel.textContent = preset.characterBase || charData?.name || 'Personaggio';

  elements.outfitCategories.textContent = '';

  if (!charData || !preset) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Seleziona un personaggio per vedere le opzioni di vestiario.';
    elements.outfitCategories.appendChild(empty);
    return;
  }

  // Hair section
  if (preset.hair.length > 0) {
    const hairSection = buildCollapsibleSection(
      'Capelli', 'hair', preset.hair,
      (h, i) => {
        const item = buildOutfitToggleItem(h.name, 'hairIndex', i, h.enabled);
        item.querySelector('input').addEventListener('change', (e) => {
          toggleOutfitItem('hair', i, e.target.checked);
        });
        return item;
      }
    );
    elements.outfitCategories.appendChild(hairSection);
  }

  // Group clothing by category
  const byCategory = {};
  for (const item of preset.clothing) {
    const cat = item.category || 'accessori';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push({ item, globalIndex: preset.clothing.indexOf(item) });
  }

  const categoryOrder = ['top', 'pantaloni', 'gonna', 'intimo', 'calze', 'scarpe', 'accessori', 'viso'];
  const sortedCategories = Object.keys(byCategory).sort((a, b) => {
    const ia = categoryOrder.indexOf(a);
    const ib = categoryOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  for (const cat of sortedCategories) {
    const catItems = byCategory[cat];
    const title = cat.charAt(0).toUpperCase() + cat.slice(1) + ' (' + catItems.length + ')';
    const section = buildCollapsibleSection(
      title, cat, catItems,
      (entry) => {
        const toggle = buildOutfitToggleItem(entry.item.name, 'clothingIndex', entry.globalIndex, entry.item.enabled);
        toggle.querySelector('input').addEventListener('change', (e) => {
          toggleOutfitItem('clothing', entry.globalIndex, e.target.checked);
        });
        return toggle;
      }
    );
    elements.outfitCategories.appendChild(section);
  }
}

function renderMorphPanel(charData, preset) {
  const charLabel = elements.morphActiveCharacter.querySelector('.outfit-char-label');
  if (charLabel) charLabel.textContent = preset?.characterBase || charData?.name || 'Personaggio';

  elements.morphCategories.textContent = '';

  if (!charData?.morphs?.categories) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Seleziona un personaggio per vedere i morph disponibili.';
    elements.morphCategories.appendChild(empty);
    return;
  }

  const cats = charData.morphs.categories;
  const categoryOrder = ['volto', 'occhi', 'naso', 'bocca', 'pelle', 'seno', 'fisico', 'mani e posa'];
  const sortedCats = Object.keys(cats).sort((a, b) => {
    const ia = categoryOrder.indexOf(a);
    const ib = categoryOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  for (const cat of sortedCats) {
    const morphs = cats[cat];
    if (!morphs || morphs.length === 0) continue;

    const group = document.createElement('div');
    group.className = 'morph-category-group';

    const head = document.createElement('h3');
    head.className = 'morph-category-head collapsible';
    head.dataset.morphSection = cat;
    head.textContent = cat.charAt(0).toUpperCase() + cat.slice(1) + ' (' + morphs.length + ')';

    const grid = document.createElement('div');
    grid.className = 'morph-slider-grid';
    grid.dataset.morphSectionBody = cat;

    for (const m of morphs) {
      const val = preset?.morphOverrides?.[m.name] ?? m.value ?? 0;

      const sliderItem = document.createElement('div');
      sliderItem.className = 'morph-slider-item';

      const label = document.createElement('label');
      label.textContent = m.name;

      const input = document.createElement('input');
      input.type = 'range';
      input.min = '-1';
      input.max = '1';
      input.step = '0.01';
      input.value = String(val);
      input.dataset.morphName = m.name;

      const badge = document.createElement('span');
      badge.className = 'morph-value-badge';
      badge.textContent = Number(val).toFixed(2);

      input.addEventListener('input', () => {
        badge.textContent = Number(input.value).toFixed(2);
      });
      input.addEventListener('change', () => {
        updateMorphOverride(input.dataset.morphName, Number(input.value));
      });

      sliderItem.appendChild(label);
      sliderItem.appendChild(input);
      sliderItem.appendChild(badge);
      grid.appendChild(sliderItem);
    }

    head.addEventListener('click', () => {
      grid.classList.toggle('collapsed');
      head.classList.toggle('collapsed');
    });

    group.appendChild(head);
    group.appendChild(grid);
    elements.morphCategories.appendChild(group);
  }
}

function renderSkinPackGrid(packages) {
  state.skinPackages = packages || [];
  const preset = activeProfile()?.characterPreset;

  elements.skinPackGrid.textContent = '';

  if (!state.skinPackages.length) {
    const note = document.createElement('div');
    note.className = 'meta-note';
    note.textContent = 'Nessun skin pack trovato.';
    elements.skinPackGrid.appendChild(note);
    return;
  }

  state.skinPackages.forEach((pkg, i) => {
    const selected = preset?.skinPackage && preset.skinPackage === pkg.path;
    const card = document.createElement('div');
    card.className = 'skin-pack-card' + (selected ? ' selected' : '');
    card.dataset.skinIndex = String(i);

    const strong = document.createElement('strong');
    strong.textContent = pkg.name || pkg.path;
    card.appendChild(strong);

    if (pkg.creator) {
      const note = document.createElement('span');
      note.className = 'meta-note';
      note.textContent = pkg.creator;
      card.appendChild(note);
    }

    card.addEventListener('click', () => void applySkinPackage(pkg));
    elements.skinPackGrid.appendChild(card);
  });
}

async function applySkinPackage(pkg) {
  const profile = activeProfile();
  if (!profile?.characterPreset) return;
  const characterPreset = { ...profile.characterPreset, skinPackage: pkg.path };
  const snapshot = await window.gemcodeCompanion.updateProfile(profile.id, { characterPreset });
  renderSnapshot(snapshot);
  renderSkinPackGrid(state.skinPackages);
  updateCharPreviewBar(state.characterData, characterPreset);
  setChatStatus(`Skin pack applicato: ${pkg.name || pkg.path}`);
}

async function toggleOutfitItem(type, index, enabled) {
  const profile = activeProfile();
  if (!profile?.characterPreset) return;
  const preset = { ...profile.characterPreset };
  if (type === 'clothing') {
    preset.clothing = [...preset.clothing];
    if (preset.clothing[index]) {
      preset.clothing[index] = { ...preset.clothing[index], enabled };
    }
  } else if (type === 'hair') {
    preset.hair = [...preset.hair];
    if (preset.hair[index]) {
      preset.hair[index] = { ...preset.hair[index], enabled };
    }
  }
  const snapshot = await window.gemcodeCompanion.updateProfile(profile.id, { characterPreset: preset });
  state.snapshot = snapshot;
  updateCharPreviewBar(state.characterData, preset);
}

async function updateMorphOverride(morphName, value) {
  const profile = activeProfile();
  if (!profile?.characterPreset) return;
  const preset = { ...profile.characterPreset };
  preset.morphOverrides = { ...preset.morphOverrides, [morphName]: value };
  const snapshot = await window.gemcodeCompanion.updateProfile(profile.id, { characterPreset: preset });
  state.snapshot = snapshot;
}

function updateCharPreviewBar(charData, preset) {
  const nameEl = elements.charPreviewMeta.querySelector('.char-preview-name');
  const detailsEl = elements.charPreviewMeta.querySelector('.char-preview-details');

  if (!charData || !preset) {
    if (nameEl) nameEl.textContent = '\u2014';
    if (detailsEl) detailsEl.textContent = 'Seleziona un personaggio per iniziare';
    elements.charPreviewOutfitSummary.textContent = '';
    elements.charPreviewThumb.textContent = '';
    const fallback = document.createElement('div');
    fallback.className = 'avatar-preview-fallback-core small';
    elements.charPreviewThumb.appendChild(fallback);
    return;
  }

  if (nameEl) nameEl.textContent = preset.characterBase || charData.name || '';
  if (detailsEl) {
    const enabledClothing = preset.clothing.filter(c => c.enabled).length;
    const totalClothing = preset.clothing.length;
    const enabledHair = preset.hair.filter(h => h.enabled).length;
    detailsEl.textContent = `Abiti ${enabledClothing}/${totalClothing} · Capelli ${enabledHair} · Morph ${Object.keys(preset.morphOverrides).length}`;
  }

  // Preview thumbnail
  elements.charPreviewThumb.textContent = '';
  if (charData.previewImage) {
    const img = document.createElement('img');
    img.src = encodeURI(`file:///${charData.previewImage.replace(/\\/g, '/')}`);
    img.alt = 'preview';
    elements.charPreviewThumb.appendChild(img);
  } else {
    const fallback = document.createElement('div');
    fallback.className = 'avatar-preview-fallback-core small';
    elements.charPreviewThumb.appendChild(fallback);
  }

  // Outfit summary pills
  const activeCats = {};
  for (const c of preset.clothing.filter(c => c.enabled)) {
    activeCats[c.category] = (activeCats[c.category] || 0) + 1;
  }
  elements.charPreviewOutfitSummary.textContent = '';
  for (const [cat, count] of Object.entries(activeCats)) {
    const pill = document.createElement('span');
    pill.className = 'outfit-pill';
    pill.textContent = `${cat} (${count})`;
    elements.charPreviewOutfitSummary.appendChild(pill);
  }
}

async function renderSavedPresets() {
  const presets = await window.gemcodeCompanion.listCharacterPresets();
  state.savedPresets = presets;

  elements.savedPresetList.textContent = '';

  if (!presets || presets.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Nessun preset salvato.';
    elements.savedPresetList.appendChild(empty);
    return;
  }

  for (const p of presets) {
    const item = document.createElement('div');
    item.className = 'saved-preset-item';

    const info = document.createElement('div');
    info.className = 'saved-preset-info';
    const strong = document.createElement('strong');
    strong.textContent = p.name || p.fileName;
    const meta = document.createElement('span');
    meta.className = 'meta-note';
    meta.textContent = p.characterBase || '';
    info.appendChild(strong);
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'saved-preset-actions';

    const loadBtn = document.createElement('button');
    loadBtn.className = 'secondary-button';
    loadBtn.textContent = 'Carica';
    loadBtn.addEventListener('click', () => void loadPreset(p.fileName));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'danger-button';
    deleteBtn.textContent = 'Elimina';
    deleteBtn.addEventListener('click', () => void deletePreset(p.fileName));

    actions.appendChild(loadBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(info);
    item.appendChild(actions);
    elements.savedPresetList.appendChild(item);
  }
}

async function saveCurrentPreset() {
  const profile = activeProfile();
  if (!profile?.characterPreset?.sourceScene) {
    setChatStatus('Nessun personaggio selezionato da salvare');
    return;
  }
  const name = elements.presetSaveName.value.trim();
  if (!name) {
    setChatStatus('Inserisci un nome per il preset');
    return;
  }
  await window.gemcodeCompanion.saveCharacterPreset(name, profile.characterPreset);
  elements.presetSaveName.value = '';
  await renderSavedPresets();
  setChatStatus(`Preset "${name}" salvato`);
}

async function loadPreset(fileName) {
  const profile = activeProfile();
  if (!profile) return;
  const presetData = await window.gemcodeCompanion.loadCharacterPreset(fileName);
  if (!presetData) {
    setChatStatus('Errore nel caricamento del preset');
    return;
  }
  const snapshot = await window.gemcodeCompanion.updateProfile(profile.id, { characterPreset: presetData });
  renderSnapshot(snapshot);

  if (presetData.sourceScene) {
    const charData = await window.gemcodeCompanion.getCharacterData(presetData.sourceScene);
    state.characterData = charData;
    renderOutfitPanel(charData, presetData);
    renderMorphPanel(charData, presetData);
    updateCharPreviewBar(charData, presetData);
  }
  setChatStatus(`Preset caricato: ${fileName}`);
}

async function deletePreset(fileName) {
  if (!window.confirm(`Eliminare il preset "${fileName}"?`)) return;
  await window.gemcodeCompanion.deleteCharacterPreset(fileName);
  await renderSavedPresets();
  setChatStatus('Preset eliminato');
}

/* ─── Quick Avatar Select (sidebar) ─── */

function renderQuickAvatarMenu(items) {
  state.quickAvatars = Array.isArray(items) ? items : [];
  if (!state.quickAvatars.length) {
    elements.quickAvatarSelect.textContent = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Nessun preset VAM disponibile';
    elements.quickAvatarSelect.appendChild(opt);
    elements.quickAvatarSelect.disabled = true;
    elements.quickAvatarMeta.textContent = 'Nessuna scena VAM con Person trovata.';
    return;
  }

  elements.quickAvatarSelect.disabled = false;
  elements.quickAvatarSelect.textContent = '';
  for (const item of state.quickAvatars) {
    const opt = document.createElement('option');
    opt.value = item.sceneFile;
    opt.textContent = item.name + (item.characterName ? ` (${item.characterName})` : '');
    elements.quickAvatarSelect.appendChild(opt);
  }

  const profile = activeProfile();
  const currentScene = profile?.characterPreset?.sourceScene || profile?.avatar?.sceneFile || '';
  const match = state.quickAvatars.find(item => item.sceneFile === currentScene);
  if (match) elements.quickAvatarSelect.value = match.sceneFile;

  const currentItem = state.quickAvatars.find(item => item.sceneFile === elements.quickAvatarSelect.value) || state.quickAvatars[0];
  elements.quickAvatarMeta.textContent = currentItem
    ? `${currentItem.name}${currentItem.characterName ? ` · ${currentItem.characterName}` : ''} · ${currentItem.compatibility}`
    : 'Seleziona un preset avatar.';
}

async function applyQuickAvatarSelection() {
  const selected = state.quickAvatars.find(item => item.sceneFile === elements.quickAvatarSelect.value);
  if (!selected) return;
  elements.quickAvatarMeta.textContent = `${selected.name}${selected.characterName ? ` · ${selected.characterName}` : ''} · ${selected.compatibility}`;
  await selectCharacter(selected);
  setChatStatus(`Preset applicato: ${selected.name}`);
}

/* ─── Rendering ─── */

function renderProfileOptions(snapshot) {
  elements.profileSelect.textContent = '';
  for (const profile of snapshot.profiles) {
    const opt = document.createElement('option');
    opt.value = profile.id;
    opt.textContent = profile.name;
    elements.profileSelect.appendChild(opt);
  }
  elements.profileSelect.value = snapshot.activeProfileId;
}

function renderChatLog(messages) {
  const recentMessages = Array.isArray(messages) ? messages : [];
  elements.chatLog.textContent = '';
  if (recentMessages.length) {
    for (const message of recentMessages) {
      const div = document.createElement('div');
      div.className = 'message ' + message.role;
      div.textContent = message.text;
      elements.chatLog.appendChild(div);
    }
  } else {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Nessuna conversazione salvata nel profilo attivo.';
    elements.chatLog.appendChild(empty);
  }
  elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
  elements.recentMemoryCount.textContent = String(recentMessages.length);
}

function renderSnapshot(snapshot) {
  state.snapshot = snapshot;
  const profile = snapshot.activeProfile;
  const app = snapshot.app;

  renderProfileOptions(snapshot);

  elements.profileMeta.textContent = `Creato ${new Date(profile.metadata.createdAt || Date.now()).toLocaleString('it-IT')} · aggiornato ${new Date(profile.metadata.updatedAt || Date.now()).toLocaleString('it-IT')}`;
  elements.profileBadge.textContent = profile.identity.avatarName || profile.name;

  elements.bridgeUrl.value = app.bridgeUrl || '';
  elements.avatarLibraryRoot.value = app.avatarLibraryRoot || '';
  elements.avatarLibraryRootLabel.textContent = app.avatarLibraryRoot || 'D:\\';

  elements.profileName.value = profile.name || '';
  elements.avatarName.value = profile.identity.avatarName || '';
  elements.interlocutorName.value = profile.identity.interlocutorName || '';
  elements.avatarAge.value = profile.identity.avatarAge || '';
  elements.interlocutorAge.value = profile.identity.interlocutorAge || '';
  elements.identityRole.value = profile.identity.role || '';
  elements.relationship.value = profile.identity.relationship || '';
  elements.styleKeywords.value = profile.identity.styleKeywords || '';
  elements.biography.value = profile.identity.biography || '';
  elements.identityNotes.value = profile.identity.notes || '';

  elements.agentUrl.value = profile.llm.agentUrl || '';
  elements.model.value = profile.llm.model || '';
  elements.temperature.value = Number(profile.llm.temperature ?? 0.55);
  elements.ttsProvider.value = profile.tts.provider || 'edge-tts';
  elements.ttsVoice.value = profile.tts.voice || '';
  elements.sttLanguage.value = profile.stt.language || 'it';
  elements.autoSpeak.checked = profile.tts.autoSpeak !== false;
  elements.autoSendVoice.checked = profile.stt.autoSendVoice !== false;

  elements.widgetWidth.value = Number(profile.widget.width ?? 540);
  elements.widgetHeight.value = Number(profile.widget.height ?? 760);
  elements.widgetScale.value = Number(profile.widget.scale ?? 1);
  elements.widgetOpacity.value = Number(profile.widget.opacity ?? 1);
  elements.accentColor.value = profile.widget.accentColor || '#6ee7ff';
  elements.alwaysOnTop.checked = profile.widget.alwaysOnTop !== false;
  elements.clickThrough.checked = Boolean(profile.widget.clickThrough);
  elements.showStatus.checked = profile.widget.showStatus !== false;
  elements.showTranscript.checked = profile.widget.showTranscript !== false;

  elements.systemPrompt.value = profile.llm.systemPrompt || '';
  elements.conversationStyle.value = profile.behavior.conversationStyle || '';
  elements.initiative.value = profile.behavior.initiative || 'balanced';
  elements.humor.value = profile.behavior.humor || 'low';
  elements.expressiveness.value = profile.behavior.expressiveness || 'medium';
  elements.behaviorTraits.value = profile.behavior.traits || '';
  elements.boundaries.value = profile.behavior.boundaries || '';
  elements.greeting.value = profile.behavior.greeting || '';
  elements.farewell.value = profile.behavior.farewell || '';

  elements.memorySummary.value = profile.memory.summary || '';
  elements.memoryPinnedNotes.value = profile.memory.pinnedNotes || '';
  elements.memoryKnownFacts.value = profile.memory.knownFacts || '';
  elements.memoryPrivateNotes.value = profile.memory.privateNotes || '';

  elements.permissionPcControl.value = profile.permissions.pcControl || 'ask';
  elements.permissionScreenRead.value = profile.permissions.screenRead || 'allow';
  elements.permissionWebcam.value = profile.permissions.webcam || 'deny';
  elements.permissionFileAccess.value = profile.permissions.fileAccess || 'ask';
  elements.permissionBrowserAutomation.value = profile.permissions.browserAutomation || 'ask';
  elements.permissionMicrophone.value = profile.permissions.microphone || 'allow';
  elements.permissionNotifications.value = profile.permissions.notifications || 'allow';

  setSliderBadge(elements.temperature, elements.temperatureValue);
  setSliderBadge(elements.widgetWidth, elements.widgetWidthValue, ' px');
  setSliderBadge(elements.widgetHeight, elements.widgetHeightValue, ' px');
  setSliderBadge(elements.widgetScale, elements.widgetScaleValue, 'x');
  setSliderBadge(elements.widgetOpacity, elements.widgetOpacityValue);

  renderChatLog(profile.memory.recentMessages || []);

  // Update character preview bar from existing preset
  const preset = profile.characterPreset;
  if (preset?.sourceScene && state.characterData) {
    updateCharPreviewBar(state.characterData, preset);
  }
}

/* ─── Data Collection ─── */

function collectAppSettingsFromForm() {
  return {
    bridgeUrl: elements.bridgeUrl.value.trim(),
    avatarLibraryRoot: elements.avatarLibraryRoot.value.trim(),
  };
}

function collectProfileFromForm() {
  const profile = activeProfile();
  return {
    name: elements.profileName.value.trim(),
    identity: {
      avatarName: elements.avatarName.value.trim(),
      interlocutorName: elements.interlocutorName.value.trim(),
      avatarAge: elements.avatarAge.value.trim(),
      interlocutorAge: elements.interlocutorAge.value.trim(),
      role: elements.identityRole.value.trim(),
      relationship: elements.relationship.value.trim(),
      biography: elements.biography.value,
      styleKeywords: elements.styleKeywords.value.trim(),
      notes: elements.identityNotes.value,
    },
    llm: {
      agentUrl: elements.agentUrl.value.trim(),
      model: elements.model.value.trim(),
      systemPrompt: elements.systemPrompt.value,
      temperature: Number(elements.temperature.value),
      maxResponseSentences: profile?.llm?.maxResponseSentences ?? 3,
      maxResponseChars: profile?.llm?.maxResponseChars ?? 280,
    },
    tts: {
      provider: elements.ttsProvider.value,
      voice: elements.ttsVoice.value.trim(),
      autoSpeak: elements.autoSpeak.checked,
    },
    stt: {
      provider: profile?.stt?.provider || 'bridge-whisper',
      language: elements.sttLanguage.value.trim() || 'it',
      autoSendVoice: elements.autoSendVoice.checked,
      mode: profile?.stt?.mode || 'push-to-talk',
    },
    behavior: {
      conversationStyle: elements.conversationStyle.value.trim(),
      initiative: elements.initiative.value,
      humor: elements.humor.value,
      expressiveness: elements.expressiveness.value,
      boundaries: elements.boundaries.value,
      greeting: elements.greeting.value.trim(),
      farewell: elements.farewell.value.trim(),
      traits: elements.behaviorTraits.value,
    },
    permissions: {
      pcControl: elements.permissionPcControl.value,
      screenRead: elements.permissionScreenRead.value,
      webcam: elements.permissionWebcam.value,
      fileAccess: elements.permissionFileAccess.value,
      browserAutomation: elements.permissionBrowserAutomation.value,
      microphone: elements.permissionMicrophone.value,
      notifications: elements.permissionNotifications.value,
    },
    memory: {
      summary: elements.memorySummary.value,
      pinnedNotes: elements.memoryPinnedNotes.value,
      knownFacts: elements.memoryKnownFacts.value,
      privateNotes: elements.memoryPrivateNotes.value,
      recentMessages: profile?.memory?.recentMessages || [],
    },
    widget: {
      width: Number(elements.widgetWidth.value),
      height: Number(elements.widgetHeight.value),
      scale: Number(elements.widgetScale.value),
      opacity: Number(elements.widgetOpacity.value),
      accentColor: elements.accentColor.value,
      alwaysOnTop: elements.alwaysOnTop.checked,
      clickThrough: elements.clickThrough.checked,
      showStatus: elements.showStatus.checked,
      showTranscript: elements.showTranscript.checked,
      x: profile?.widget?.x ?? null,
      y: profile?.widget?.y ?? null,
    },
    avatar: {
      name: elements.avatarName.value.trim() || elements.profileName.value.trim(),
      baseImage: profile?.avatar?.baseImage || '',
      blinkImage: profile?.avatar?.blinkImage || '',
      mouthOpenImage: profile?.avatar?.mouthOpenImage || '',
      auraImage: profile?.avatar?.auraImage || '',
      primaryModel: profile?.avatar?.primaryModel || '',
      idleAnimation: profile?.avatar?.idleAnimation || 'breathe',
      sceneFile: profile?.characterPreset?.sourceScene || profile?.avatar?.sceneFile || '',
    },
    characterPreset: profile?.characterPreset || undefined,
  };
}

/* ─── Chat & Voice ─── */

function setChatStatus(text) {
  elements.chatStatus.textContent = text;
}

function updateWidgetLiveState(payload) {
  window.gemcodeCompanion.updateWidgetLiveState(payload);
}

async function saveAppSettings() {
  const snapshot = await window.gemcodeCompanion.saveAppSettings(collectAppSettingsFromForm());
  renderSnapshot(snapshot);
  return snapshot;
}

async function saveProfile() {
  const profile = activeProfile();
  if (!profile) return null;
  const snapshot = await window.gemcodeCompanion.updateProfile(profile.id, collectProfileFromForm());
  renderSnapshot(snapshot);
  return snapshot;
}

function buildCompositeSystemPrompt(profile) {
  const permissions = [
    `Controllo PC: ${profile.permissions.pcControl}`,
    `Lettura schermo: ${profile.permissions.screenRead}`,
    `Webcam: ${profile.permissions.webcam}`,
    `File: ${profile.permissions.fileAccess}`,
    `Browser: ${profile.permissions.browserAutomation}`,
    `Microfono: ${profile.permissions.microphone}`,
    `Notifiche: ${profile.permissions.notifications}`,
  ].join('\n');

  const memoryParts = [profile.memory.summary, profile.memory.pinnedNotes, profile.memory.knownFacts, profile.memory.privateNotes]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join('\n\n');

  const recentMessages = (profile.memory.recentMessages || [])
    .slice(-8)
    .map(message => `${message.role === 'assistant' ? 'Avatar' : 'Utente'}: ${message.text}`)
    .join('\n');

  return [
    profile.llm.systemPrompt,
    `Identita avatar: ${profile.identity.avatarName}, eta ${profile.identity.avatarAge || 'n/d'}, ruolo ${profile.identity.role || 'n/d'}.`,
    `Interlocutore: ${profile.identity.interlocutorName || 'Utente'}, eta ${profile.identity.interlocutorAge || 'n/d'}, relazione ${profile.identity.relationship || 'n/d'}.`,
    `Stile: ${profile.behavior.conversationStyle || ''}. Tratti: ${profile.behavior.traits || ''}. Keywords: ${profile.identity.styleKeywords || ''}.`,
    `Boundaries: ${profile.behavior.boundaries || ''}`,
    `Permessi:\n${permissions}`,
    memoryParts ? `Memoria privata:\n${memoryParts}` : '',
    recentMessages ? `Contesto recente:\n${recentMessages}` : '',
    'Espressioni: Inserisci UNA tra [neutral] [smile] [sad] [angry] [surprised] [flirty] nella risposta per indicare il tuo stato emotivo.',
    'Gesti: Puoi inserire {action:nome} per un gesto. Gesti validi: nod, shake_head, tilt_head, lean_in, deep_breath, look_away, shrug.',
    'Rispondi in italiano, con naturalezza, senza diventare prolissa. Se un permesso e negato o solo su richiesta, dichiaralo con chiarezza.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function persistRecentMessages(messages) {
  const profile = activeProfile();
  if (!profile) return;
  const merged = collectProfileFromForm();
  merged.avatar = {
    ...profile.avatar,
    ...merged.avatar,
  };
  merged.memory.recentMessages = messages.slice(-24);
  const snapshot = await window.gemcodeCompanion.updateProfile(profile.id, merged);
  renderSnapshot(snapshot);
}

function parseEmotionAndGestures(text) {
  const emotionMatch = text.match(/\[(neutral|smile|sad|angry|surprised|flirty)\]/i);
  const emotion = emotionMatch ? emotionMatch[1].toLowerCase() : null;
  const gestureMatches = text.match(/\{action\s*:\s*(\w+)\}/g) || [];
  const gestures = gestureMatches.map(m => m.match(/\{action\s*:\s*(\w+)\}/)[1]);
  const cleanText = text
    .replace(/\[(neutral|smile|sad|angry|surprised|flirty)\]/gi, '')
    .replace(/\{action\s*:\s*\w+\}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { cleanText, emotion, gestures };
}

function concatenateFloat32(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function encodeWav(floatBuffer, sampleRate) {
  const wavBuffer = new ArrayBuffer(44 + floatBuffer.length * 2);
  const view = new DataView(wavBuffer);
  const writeString = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + floatBuffer.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, floatBuffer.length * 2, true);

  let offset = 44;
  for (let index = 0; index < floatBuffer.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, floatBuffer[index]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

async function startVoiceRecording() {
  if (state.recording) return;
  if (!requirePermission(activeProfile()?.permissions?.microphone, 'Microfono')) return;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioContext = new AudioContext({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const chunks = [];

  processor.onaudioprocess = event => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  state.recording = { stream, audioContext, processor, source, chunks };
  elements.recordStatus.textContent = 'Registrazione in corso';
  elements.recordButton.textContent = 'Ferma registrazione';
  setChatStatus('Listening');
  updateWidgetLiveState({ phase: 'listening', transcript: '', responseText: '' });
}

async function stopVoiceRecording() {
  if (!state.recording) return;
  const profile = activeProfile();
  const { stream, audioContext, processor, source, chunks } = state.recording;
  processor.disconnect();
  source.disconnect();
  stream.getTracks().forEach(track => track.stop());
  await audioContext.close();
  state.recording = null;
  elements.recordStatus.textContent = 'Microfono inattivo';
  elements.recordButton.textContent = 'Registra voce';

  const floatBuffer = concatenateFloat32(chunks);
  const wavBlob = encodeWav(floatBuffer, 16000);
  const audioBase64 = await blobToBase64(wavBlob);
  setChatStatus('Transcribing');
  updateWidgetLiveState({ phase: 'thinking', transcript: 'Trascrizione in corso...', responseText: '' });

  const response = await fetch(`${elements.bridgeUrl.value.trim()}/api/companion/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio_base64: audioBase64,
      language: profile?.stt?.language || elements.sttLanguage.value.trim() || 'it',
    }),
  });
  const payload = await response.json();
  const transcript = payload.transcript || '';
  elements.chatInput.value = transcript;
  updateWidgetLiveState({ phase: transcript ? 'thinking' : 'idle', transcript, responseText: '' });
  if (transcript && elements.autoSendVoice.checked) {
    await sendChat(transcript, true);
    return;
  }
  setChatStatus('Idle');
}

async function sendChat(text, fromVoice = false) {
  const profile = activeProfile();
  if (!profile) return;

  const cleanText = (text || elements.chatInput.value).trim();
  if (!cleanText) return;
  const originalInputValue = elements.chatInput.value;

  const collectedProfile = collectProfileFromForm();
  const currentMessages = [...(profile.memory.recentMessages || [])];
  const userMessage = { role: 'user', text: cleanText, ts: new Date().toISOString() };
  const pendingMessages = [...currentMessages, userMessage].slice(-24);
  renderChatLog(pendingMessages);

  setChatStatus('Thinking');
  updateWidgetLiveState({ phase: 'thinking', transcript: cleanText, responseText: '' });

  const runtimeProfile = {
    ...profile,
    ...collectedProfile,
    identity: { ...profile.identity, ...collectedProfile.identity },
    llm: { ...profile.llm, ...collectedProfile.llm },
    tts: { ...profile.tts, ...collectedProfile.tts },
    stt: { ...profile.stt, ...collectedProfile.stt },
    behavior: { ...profile.behavior, ...collectedProfile.behavior },
    permissions: { ...profile.permissions, ...collectedProfile.permissions },
    memory: { ...profile.memory, ...collectedProfile.memory, recentMessages: pendingMessages },
    widget: { ...profile.widget, ...collectedProfile.widget },
    avatar: { ...profile.avatar, ...collectedProfile.avatar },
  };

  try {
    const response = await fetch(`${elements.bridgeUrl.value.trim()}/api/companion/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: cleanText,
        agent_url: runtimeProfile.llm.agentUrl,
        model: runtimeProfile.llm.model,
        system_prompt: buildCompositeSystemPrompt(runtimeProfile),
        temperature: Number(runtimeProfile.llm.temperature),
        max_response_sentences: runtimeProfile.llm.maxResponseSentences,
        max_response_chars: runtimeProfile.llm.maxResponseChars,
        speak: runtimeProfile.tts.autoSpeak,
        tts_provider: runtimeProfile.tts.provider,
        tts_voice: runtimeProfile.tts.voice,
        device_id: `desktop-companion:${runtimeProfile.id}`,
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    const rawResponse = payload.response_text || payload.error || 'Nessuna risposta';
    const parsed = parseEmotionAndGestures(rawResponse);
    const responseText = parsed.cleanText || rawResponse;
    const nextMessages = [...pendingMessages, { role: 'assistant', text: responseText, ts: new Date().toISOString() }].slice(-24);

    if (!fromVoice) {
      elements.chatInput.value = '';
    }

    renderChatLog(nextMessages);
    await persistRecentMessages(nextMessages);

    const liveState = { phase: payload.audio_url ? 'speaking' : 'idle', transcript: cleanText, responseText };
    if (parsed.emotion) liveState.emotion = parsed.emotion;
    if (parsed.gestures.length > 0) liveState.gesture = parsed.gestures[0];
    updateWidgetLiveState(liveState);
    setChatStatus(payload.audio_url ? 'Speaking' : 'Idle');

    if (payload.audio_url) {
      const audio = new Audio(payload.audio_url);
      audio.addEventListener('ended', () => {
        updateWidgetLiveState({ phase: 'idle', transcript: cleanText, responseText });
        setChatStatus('Idle');
      });
      audio.play().catch(() => {
        updateWidgetLiveState({ phase: 'idle', transcript: cleanText, responseText });
        setChatStatus('Idle');
      });
    }
  } catch (error) {
    if (!fromVoice) {
      elements.chatInput.value = originalInputValue;
    }
    setChatStatus(`Errore chat: ${error.message || error}`);
    updateWidgetLiveState({ phase: 'error', transcript: cleanText, responseText: `Errore chat: ${error.message || error}` });
  }
}

/* ─── Scan & Health ─── */

async function scanAvatarLibrary(rootOverride) {
  if (!requirePermission(activeProfile()?.permissions?.fileAccess, 'Scansione libreria avatar')) return;
  elements.characterGrid.textContent = '';
  const scanning = document.createElement('div');
  scanning.className = 'empty-state';
  scanning.textContent = 'Scansione in corso...';
  elements.characterGrid.appendChild(scanning);

  const targetRoot = rootOverride || elements.avatarLibraryRoot.value.trim() || elements.avatarLibraryRootLabel.textContent || 'D:\\';
  const payload = await window.gemcodeCompanion.scanAvatarLibrary(targetRoot);
  const items = payload.items || [];
  state.avatarLibrary = items;
  elements.avatarLibraryRootLabel.textContent = payload.rootPath || targetRoot;
  renderCharacterGrid(items);
}

async function loadQuickAvatarMenu() {
  const payload = await window.gemcodeCompanion.listQuickVamAvatars();
  renderQuickAvatarMenu(payload.items || []);
}

/* ─── VAM Package Scanner ─── */

let _activePkgCategory = 'character';
let _vamPackagesData = {};

async function scanVamPackages() {
  const bridgeUrl = elements.bridgeUrl.value.trim();
  const statusEl = $('packageScanStatus');
  const gridEl = $('packageGrid');
  statusEl.textContent = 'Scansione in corso...';
  gridEl.innerHTML = '';

  try {
    const response = await fetch(`${bridgeUrl}/api/vam/packages`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    _vamPackagesData = await response.json();

    // Update counters
    for (const cat of ['character', 'clothing', 'hair', 'morph']) {
      const countEl = $('pkgCount' + cat.charAt(0).toUpperCase() + cat.slice(1));
      if (countEl) countEl.textContent = String((_vamPackagesData[cat] || []).length);
    }

    statusEl.textContent = `${_vamPackagesData.total || 0} pacchetti trovati · ${_vamPackagesData.scanned_at || ''}`;
    renderPackageGrid(_activePkgCategory);
  } catch (err) {
    statusEl.textContent = `Errore: ${err.message}`;
    gridEl.innerHTML = '<div class="empty-state">Bridge non raggiungibile. Avvia il voice bridge.</div>';
  }
}

function renderPackageGrid(category) {
  const gridEl = $('packageGrid');
  const items = _vamPackagesData[category] || [];
  gridEl.innerHTML = '';

  if (!items.length) {
    gridEl.innerHTML = '<div class="empty-state">Nessun pacchetto in questa categoria.</div>';
    return;
  }

  for (const pkg of items) {
    const card = document.createElement('div');
    card.className = 'package-card';
    const itemsHtml = (pkg.items && pkg.items.length)
      ? `<div class="pkg-items">${pkg.items.length} item: ${pkg.items.slice(0, 3).map(i => escapeHtml(i)).join(', ')}${pkg.items.length > 3 ? '...' : ''}</div>`
      : '';
    const descHtml = pkg.description
      ? `<div class="pkg-desc">${escapeHtml(pkg.description)}</div>`
      : '';
    card.innerHTML = `<h4>${escapeHtml(pkg.name)}</h4>
      <span class="pkg-creator">${escapeHtml(pkg.creator)}</span>
      ${descHtml}
      <span class="pkg-size">${pkg.size_mb} MB · ${escapeHtml(pkg.file)}</span>
      ${itemsHtml}`;
    gridEl.appendChild(card);
  }
}

async function refreshBridgeHealth() {
  const bridgeUrl = elements.bridgeUrl.value.trim();
  try {
    const response = await fetch(`${bridgeUrl}/api/bridge/health`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    elements.bridgeHealth.textContent = `Bridge: online · ${payload.public_host}`;
  } catch (error) {
    elements.bridgeHealth.textContent = `Bridge: offline · ${error.message}`;
  }
}

/* ─── Events ─── */

function bindEvents() {
  elements.temperature.addEventListener('input', () => setSliderBadge(elements.temperature, elements.temperatureValue));
  elements.widgetWidth.addEventListener('input', () => setSliderBadge(elements.widgetWidth, elements.widgetWidthValue, ' px'));
  elements.widgetHeight.addEventListener('input', () => setSliderBadge(elements.widgetHeight, elements.widgetHeightValue, ' px'));
  elements.widgetScale.addEventListener('input', () => setSliderBadge(elements.widgetScale, elements.widgetScaleValue, 'x'));
  elements.widgetOpacity.addEventListener('input', () => setSliderBadge(elements.widgetOpacity, elements.widgetOpacityValue));

  elements.focusWidgetButton.addEventListener('click', () => window.gemcodeCompanion.focusWidget());
  elements.saveAppButton.addEventListener('click', () => void saveAppSettings());
  elements.saveProfileButton.addEventListener('click', () => void saveProfile());

  elements.quickAvatarSelect.addEventListener('change', () => void applyQuickAvatarSelection());

  elements.profileSelect.addEventListener('change', async () => {
    const snapshot = await window.gemcodeCompanion.setActiveProfile(elements.profileSelect.value);
    renderSnapshot(snapshot);
  });

  elements.createProfileButton.addEventListener('click', async () => {
    const snapshot = await window.gemcodeCompanion.createProfile({
      name: 'Nuovo Profilo',
      identity: { avatarName: 'Nuovo Avatar', interlocutorName: 'Tu' },
    });
    renderSnapshot(snapshot);
  });

  elements.duplicateProfileButton.addEventListener('click', async () => {
    const profile = activeProfile();
    if (!profile) return;
    const snapshot = await window.gemcodeCompanion.duplicateProfile(profile.id);
    renderSnapshot(snapshot);
  });

  elements.deleteProfileButton.addEventListener('click', async () => {
    const profile = activeProfile();
    if (!profile) return;
    if (!window.confirm(`Eliminare il profilo "${profile.name}"?`)) return;
    const snapshot = await window.gemcodeCompanion.deleteProfile(profile.id);
    renderSnapshot(snapshot);
  });

  elements.importProfileButton.addEventListener('click', async () => {
    if (!requirePermission(activeProfile()?.permissions?.fileAccess, 'Import profilo da file')) return;
    const result = await window.gemcodeCompanion.importProfile();
    if (result?.snapshot) {
      renderSnapshot(result.snapshot);
    }
    if (!result?.canceled) {
      setChatStatus(`Importati ${result.importedCount || 1} profili`);
    }
  });

  elements.exportProfileButton.addEventListener('click', async () => {
    const profile = activeProfile();
    if (!profile) return;
    if (!requirePermission(profile.permissions?.fileAccess, 'Export profilo su file')) return;
    const result = await window.gemcodeCompanion.exportProfile(profile.id);
    if (!result?.canceled) {
      setChatStatus('Profilo esportato');
    }
  });

  elements.pickAvatarRootButton.addEventListener('click', async () => {
    if (!requirePermission(activeProfile()?.permissions?.fileAccess, 'Selezione cartella avatar')) return;
    const selected = await window.gemcodeCompanion.pickAvatarRoot();
    if (!selected) return;
    elements.avatarLibraryRoot.value = selected;
    await saveAppSettings();
    await scanAvatarLibrary(selected);
  });

  elements.scanAvatarLibraryButton.addEventListener('click', () => void scanAvatarLibrary());

  elements.clickThrough.addEventListener('change', async () => {
    await window.gemcodeCompanion.toggleClickThrough(elements.clickThrough.checked);
  });

  // Character panel tab switching
  document.querySelectorAll('.char-tab').forEach(tab => {
    tab.addEventListener('click', () => switchCharTab(tab.dataset.charTab));
  });

  // Preset save
  elements.savePresetButton.addEventListener('click', () => void saveCurrentPreset());

  // VAM package scanner
  const scanPkgBtn = $('scanVamPackagesButton');
  if (scanPkgBtn) scanPkgBtn.addEventListener('click', () => void scanVamPackages());
  document.querySelectorAll('.pkg-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      _activePkgCategory = btn.dataset.pkgCat;
      document.querySelectorAll('.pkg-filter').forEach(b => b.classList.toggle('active', b === btn));
      renderPackageGrid(_activePkgCategory);
    });
  });

  elements.recordButton.addEventListener('click', async () => {
    if (state.recording) {
      await stopVoiceRecording();
    } else {
      await startVoiceRecording();
    }
  });

  elements.sendButton.addEventListener('click', () => void sendChat());
  elements.chatInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendChat();
    }
  });
}

/* ─── Init ─── */

async function init() {
  bindElements();
  bindEvents();
  renderSnapshot(await window.gemcodeCompanion.getSettings());
  await loadQuickAvatarMenu();
  await scanAvatarLibrary(state.snapshot?.app?.avatarLibraryRoot);
  await renderSavedPresets();
  await refreshBridgeHealth();
  state.bridgeHealthTimer = window.setInterval(refreshBridgeHealth, 10000);

  // Restore character data if profile has a preset with sourceScene
  const profile = activeProfile();
  if (profile?.characterPreset?.sourceScene) {
    try {
      const charData = await window.gemcodeCompanion.getCharacterData(profile.characterPreset.sourceScene);
      state.characterData = charData;
      renderOutfitPanel(charData, profile.characterPreset);
      renderMorphPanel(charData, profile.characterPreset);
      updateCharPreviewBar(charData, profile.characterPreset);
    } catch (err) {
      console.warn('Could not restore character data:', err);
    }
  }

  // Load skin packages
  try {
    const catalog = await window.gemcodeCompanion.getVamAssetCatalog();
    if (catalog?.characters) {
      renderSkinPackGrid(catalog.characters);
    }
  } catch (err) {
    console.warn('Could not load skin packs:', err);
  }

  window.gemcodeCompanion.onSettingsUpdated(snapshot => {
    renderSnapshot(snapshot);
    renderQuickAvatarMenu(state.quickAvatars);
  });
}

window.addEventListener('error', (e) => {
  console.error(`[GLOBAL ERROR] ${e.message} at ${e.filename}:${e.lineno}:${e.colno}`);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error(`[UNHANDLED REJECTION] ${e.reason}`);
});

init().catch(error => {
  console.error(`[INIT ERROR] ${error.stack || error.message || error}`);
  elements.chatStatus.textContent = `Errore init: ${error.message}`;
});
