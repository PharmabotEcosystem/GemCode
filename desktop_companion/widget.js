// No 3D rendering in widget — VAM handles all 3D via AICompanion.cs

const root = document.getElementById('widgetRoot');
const avatarStage = document.getElementById('avatarStage');
const modelViewport = document.getElementById('modelViewport');
const avatarBase = document.getElementById('avatarBase');
const avatarBlink = document.getElementById('avatarBlink');
const avatarMouth = document.getElementById('avatarMouth');
const avatarAura = document.getElementById('avatarAura');
const syntheticFaceFx = document.getElementById('syntheticFaceFx');
const fallbackAvatar = document.getElementById('fallbackAvatar');
const auraLayer = document.getElementById('auraLayer');
const speechBubble = document.getElementById('speechBubble');
const statusChip = document.getElementById('statusChip');
const personaChip = document.getElementById('personaChip');
const chatFab = document.getElementById('chatFab');
const chatPanel = document.getElementById('chatPanel');
const chatClose = document.getElementById('chatClose');
const settingsToggle = document.getElementById('settingsToggle');
const settingsDrawer = document.getElementById('settingsDrawer');
const quickAvatarSelect = document.getElementById('quickAvatarSelect');
const presetGrid = document.getElementById('presetGrid');
const lookSummary = document.getElementById('lookSummary');
const lookCategories = document.getElementById('lookCategories');
const libraryCatalog = document.getElementById('libraryCatalog');
const ttsVoiceInput = document.getElementById('ttsVoiceInput');
const autoSpeakCheck = document.getElementById('autoSpeakCheck');
const scaleSlider = document.getElementById('scaleSlider');
const opacitySlider = document.getElementById('opacitySlider');
const framingZoomSlider = document.getElementById('framingZoomSlider');
const framingOffsetSlider = document.getElementById('framingOffsetSlider');
const alwaysOnTopCheck = document.getElementById('alwaysOnTopCheck');
const showTranscriptCheck = document.getElementById('showTranscriptCheck');
const openStudioBtn = document.getElementById('openStudioBtn');
const testVoiceBtn = document.getElementById('testVoiceBtn');
const launchVamBtn = document.getElementById('launchVamBtn');
const chatLog = document.getElementById('chatLog');
const chatInput = document.getElementById('chatInput');
const sendButton = document.getElementById('sendButton');
const micButton = document.getElementById('micButton');
const widgetState = {
  snapshot: null,
  settings: null,
  phase: 'idle',
  transcript: '',
  responseText: '',
  applyRevision: 0,
  chatOpen: false,
  avatarPresets: [],
  vamCatalog: null,
  activeAudio: null,
  settingsSaveTimer: 0,
  activeBubbleRole: 'assistant',
  layoutObserver: null,
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// No 3D engine — VAM handles all rendering, animations, lip sync, gestures

function parseEmotionAndGestures(text) {
  const emotionMatch = String(text || '').match(/\[(neutral|smile|sad|angry|surprised|flirty)\]/i);
  const emotion = emotionMatch ? emotionMatch[1].toLowerCase() : null;
  const gestureMatches = String(text || '').match(/\{action\s*:\s*(\w+)\}/g) || [];
  const gestures = gestureMatches
    .map(match => match.match(/\{action\s*:\s*(\w+)\}/i)?.[1])
    .filter(Boolean);
  const cleanText = String(text || '')
    .replace(/\[(neutral|smile|sad|angry|surprised|flirty)\]/gi, '')
    .replace(/\{action\s*:\s*\w+\}/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { cleanText, emotion, gestures };
}

function buildLocalAudioUrl(audioUrl, bridgeBase) {
  const raw = String(audioUrl || '').trim();
  const localBridge = String(bridgeBase || 'http://localhost:10301').replace(/\/$/, '');
  if (!raw) return '';

  if (raw.startsWith('/audio/')) {
    return `${localBridge}${raw}`;
  }

  try {
    const parsed = new URL(raw);
    const audioName = decodeURIComponent(parsed.pathname.split('/audio/').pop() || '');
    if (audioName) {
      return `${localBridge}/audio/${encodeURIComponent(audioName)}`;
    }
  } catch (_) {}

  return raw;
}

function playResponseAudio(audioUrl, cleanText, responseText) {
  const bridgeBase = widgetState.snapshot?.app?.bridgeUrl || 'http://localhost:10301';
  const candidates = [buildLocalAudioUrl(audioUrl, bridgeBase), String(audioUrl || '').trim()].filter(Boolean);
  const uniqueCandidates = [...new Set(candidates)];

  const finishPlayback = () => {
    widgetState.activeAudio = null;
    window.gemcodeCompanion.updateWidgetLiveState({ phase: 'idle', transcript: cleanText, responseText, lipSync: false });
  };

  const tryPlay = index => {
    if (index >= uniqueCandidates.length) {
      finishPlayback();
      return;
    }

    const audio = new Audio(uniqueCandidates[index]);
    widgetState.activeAudio = audio;
    audio.addEventListener('ended', finishPlayback, { once: true });
    audio.addEventListener('error', () => tryPlay(index + 1), { once: true });
    audio.play().catch(() => tryPlay(index + 1));
  };

  tryPlay(0);
}

async function launchActiveVamScene() {
  const sceneFile = getActiveProfile()?.characterPreset?.sourceScene || getActiveProfile()?.avatar?.sceneFile || quickAvatarSelect.value || '';
  const result = await window.gemcodeCompanion.launchVam(sceneFile);
  const message = result?.ok
    ? (result.usedSceneArgument ? 'VaM avviato con la scena selezionata.' : 'VaM avviato. Nessuna scena valida passata, quindi parte sulla home.')
    : `Avvio VaM fallito: ${result?.error || 'errore sconosciuto'}`;
  renderSpeechBubble(message, 'assistant');
  setPhase(result?.ok ? 'idle' : 'error');
}

function syncPortraitFx() {
  const usingPortrait = modelViewport.hidden;
  const hasBasePortrait = !avatarBase.hidden && Boolean(avatarBase.getAttribute('src'));
  const hasBlinkLayer = !avatarBlink.hidden && Boolean(avatarBlink.getAttribute('src'));
  const hasMouthLayer = !avatarMouth.hidden && Boolean(avatarMouth.getAttribute('src'));
  root.classList.toggle('portrait-live', usingPortrait && hasBasePortrait);
  root.classList.toggle('synthetic-blink-enabled', usingPortrait && hasBasePortrait && !hasBlinkLayer);
  root.classList.toggle('synthetic-mouth-enabled', usingPortrait && hasBasePortrait && !hasMouthLayer);
  if (syntheticFaceFx) {
    syntheticFaceFx.hidden = !(usingPortrait && hasBasePortrait && (!hasBlinkLayer || !hasMouthLayer));
  }
}

function getLayerLayoutValue(layout, key) {
  return layout && typeof layout === 'object' ? layout[key] : undefined;
}

function applyAvatarLayerStyles(avatarSettings) {
  const layout = avatarSettings?.layerLayout || {};
  const map = [
    { element: avatarBase, key: 'base' },
    { element: avatarBlink, key: 'blink' },
    { element: avatarMouth, key: 'mouth' },
    { element: avatarAura, key: 'aura' },
  ];
  for (const item of map) {
    const layer = getLayerLayoutValue(layout, item.key) || {};
    const offsetX = Number(layer.offsetX ?? 0);
    const offsetY = Number(layer.offsetY ?? 0);
    const scale = Number(layer.scale ?? 1);
    item.element.style.transform = `translate(${offsetX}%, ${offsetY}%) scale(${scale})`;
  }
}

function setPhase(phase) {
  widgetState.phase = phase || 'idle';
  root.classList.remove('idle', 'listening', 'thinking', 'speaking', 'error');
  root.classList.add(widgetState.phase);
  statusChip.textContent = widgetState.phase.toUpperCase();
}

function setChatOpen(next) {
  widgetState.chatOpen = Boolean(next);
  root.classList.toggle('chat-open', widgetState.chatOpen);
  chatPanel.hidden = !widgetState.chatOpen;
  if (widgetState.chatOpen) {
    chatInput.focus();
  }
}

function renderSpeechBubble(text, role = 'assistant') {
  const showTranscript = widgetState.settings?.widget?.showTranscript !== false;
  if (!showTranscript || !text) {
    speechBubble.hidden = true;
    speechBubble.textContent = '';
    speechBubble.classList.remove('assistant', 'user');
    return;
  }
  speechBubble.hidden = false;
  speechBubble.textContent = text;
  speechBubble.classList.remove('assistant', 'user');
  speechBubble.classList.add(role === 'user' ? 'user' : 'assistant');
}

function renderChatLog(messages) {
  const recentMessages = Array.isArray(messages) ? messages : [];
  chatLog.innerHTML = recentMessages.length
    ? recentMessages.map(message => `<div class="message ${message.role === 'assistant' ? 'assistant' : 'user'}">${escapeHtml(message.text)}</div>`).join('')
    : '<div class="empty-state">La chat appare qui. Il widget e ora il centro dell\'interfaccia.</div>';
  chatLog.scrollTop = chatLog.scrollHeight;
}

function maybeShowTranscript() {
  const text = widgetState.phase === 'speaking' ? widgetState.responseText : widgetState.transcript;
  const role = widgetState.phase === 'speaking' ? 'assistant' : 'user';
  renderSpeechBubble(text, role);
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
  ].filter(Boolean).join('\n\n');
}

function getActiveProfile() {
  return widgetState.snapshot?.activeProfile || null;
}

function getRuntimeProfile(overrides = {}) {
  const profile = getActiveProfile();
  if (!profile) return null;
  return {
    ...profile,
    tts: {
      ...profile.tts,
      voice: ttsVoiceInput.value.trim() || profile.tts.voice,
      autoSpeak: autoSpeakCheck.checked,
    },
    widget: {
      ...profile.widget,
      scale: Number(scaleSlider.value || profile.widget.scale || 1),
      opacity: Number(opacitySlider.value || profile.widget.opacity || 1),
      alwaysOnTop: alwaysOnTopCheck.checked,
      showTranscript: showTranscriptCheck.checked,
    },
    avatar: {
      ...profile.avatar,
      framingZoom: Number(framingZoomSlider.value || profile.avatar?.framingZoom || 1),
      framingOffsetY: Number(framingOffsetSlider.value || profile.avatar?.framingOffsetY || 0),
    },
    ...overrides,
  };
}

async function updateProfilePartial(partial) {
  const profile = getActiveProfile();
  if (!profile) return null;
  return window.gemcodeCompanion.updateProfile(profile.id, partial);
}

function scheduleSettingsSave(partialBuilder) {
  window.clearTimeout(widgetState.settingsSaveTimer);
  widgetState.settingsSaveTimer = window.setTimeout(async () => {
    const profile = getActiveProfile();
    if (!profile) return;
    const partial = typeof partialBuilder === 'function' ? partialBuilder(profile) : partialBuilder;
    await updateProfilePartial(partial);
  }, 140);
}

function renderPresetOptions(items) {
  const presets = Array.isArray(items) ? items : [];
  widgetState.avatarPresets = presets;
  quickAvatarSelect.innerHTML = presets.length
    ? presets.map(item => `<option value="${escapeHtml(item.sceneFile)}">${escapeHtml(item.name)}${item.characterName ? ` · ${escapeHtml(item.characterName)}` : ''}</option>`).join('')
    : '<option value="">Nessun preset trovato</option>';
  const currentScene = widgetState.settings?.avatar?.sceneFile || '';
  if (currentScene) {
    quickAvatarSelect.value = currentScene;
  }
  renderPresetCards();
  renderCurrentLookDetails();
}

function getPresetBySceneFile(sceneFile) {
  return widgetState.avatarPresets.find(item => item.sceneFile === sceneFile) || null;
}

function createSyntheticBlinkLayerDataUri() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1400" preserveAspectRatio="none">
      <defs>
        <filter id="blur"><feGaussianBlur stdDeviation="6"/></filter>
      </defs>
      <g opacity="0.96" filter="url(#blur)">
        <ellipse cx="430" cy="355" rx="86" ry="18" fill="rgba(70,38,40,0.68)"/>
        <ellipse cx="570" cy="355" rx="86" ry="18" fill="rgba(70,38,40,0.68)"/>
      </g>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function createSyntheticMouthLayerDataUri() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1400" preserveAspectRatio="none">
      <defs>
        <filter id="blur"><feGaussianBlur stdDeviation="4"/></filter>
        <radialGradient id="lip" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stop-color="rgba(118,46,66,0.88)"/>
          <stop offset="100%" stop-color="rgba(52,18,26,0.46)"/>
        </radialGradient>
      </defs>
      <ellipse cx="500" cy="468" rx="42" ry="22" fill="url(#lip)" filter="url(#blur)" opacity="0.94"/>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function resolveAvatarVisual(avatarSettings, characterPreset) {
  const avatar = avatarSettings || {};
  const preset = getPresetBySceneFile(avatar.sceneFile || '');
  const presetPreview = preset?.baseImage || preset?.previewImage || '';
  const baseImage = avatar.baseImage || presetPreview || '';
  const blinkImage = avatar.blinkImage || preset?.blinkImage || (baseImage ? createSyntheticBlinkLayerDataUri() : '');
  const mouthOpenImage = avatar.mouthOpenImage || preset?.mouthOpenImage || (baseImage ? createSyntheticMouthLayerDataUri() : '');
  const auraImage = avatar.auraImage || preset?.auraImage || '';
  return {
    preset,
    baseImage,
    blinkImage,
    mouthOpenImage,
    auraImage,
    characterPreset: characterPreset || null,
  };
}

function renderPresetCards() {
  if (!presetGrid) return;
  const currentScene = quickAvatarSelect.value || widgetState.settings?.avatar?.sceneFile || '';
  const presets = widgetState.avatarPresets.slice(0, 12);
  if (!presets.length) {
    presetGrid.innerHTML = '<div class="catalog-card"><div class="catalog-card-title">Look rapidi</div><div class="catalog-card-meta">Nessun preset VaM disponibile nel widget.</div></div>';
    return;
  }
  presetGrid.innerHTML = presets.map(item => {
    const active = item.sceneFile === currentScene ? ' active' : '';
    const hairCount = item.appearance?.counts?.hair || 0;
    const clothingCount = item.appearance?.counts?.clothing || 0;
    const morphCount = item.appearance?.counts?.morphs || 0;
    return `
      <button class="preset-card${active}" type="button" data-scene="${escapeHtml(item.sceneFile)}">
        <div class="preset-card-title">${escapeHtml(item.characterName || item.name)}</div>
        <div class="preset-card-meta">${escapeHtml(item.name)}</div>
        <div class="preset-card-meta">Capelli ${hairCount} · Abiti ${clothingCount} · Morph ${morphCount}</div>
      </button>
    `;
  }).join('');
}

function renderCurrentLookDetails() {
  const currentScene = quickAvatarSelect.value || widgetState.settings?.avatar?.sceneFile || '';
  const preset = widgetState.avatarPresets.find(item => item.sceneFile === currentScene);
  if (!preset?.appearance) {
    lookSummary.innerHTML = '<div class="look-card"><div class="look-card-title">Aspetto</div><div class="look-card-meta">Seleziona un preset VaM con dati completi per vedere capelli, outfit, pelle e morph.</div></div>';
    lookCategories.innerHTML = '';
    return;
  }

  const appearance = preset.appearance;
  const materialInfo = appearance.materials?.skinTone ? `Pelle ${escapeHtml(appearance.materials.skinTone)}` : 'Pelle letta da VaM';
  lookSummary.innerHTML = [
    `<span class="look-pill"><strong>Personaggio</strong>${escapeHtml(preset.characterName || preset.name)}</span>`,
    `<span class="look-pill"><strong>Capelli</strong>${appearance.counts.hair}</span>`,
    `<span class="look-pill"><strong>Abiti</strong>${appearance.counts.clothing}</span>`,
    `<span class="look-pill"><strong>Morph</strong>${appearance.counts.morphs}</span>`,
    `<span class="look-pill"><strong>Materiali</strong>${escapeHtml(materialInfo)}</span>`,
  ].join('');

  const cards = [];
  if (appearance.hair?.length) {
    cards.push(`<div class="look-card"><div class="look-card-title">Capelli</div><div class="look-card-meta">${appearance.hair.slice(0, 4).map(item => escapeHtml(item.name)).join(' · ')}</div></div>`);
  }
  for (const [category, items] of Object.entries(appearance.clothingCategories || {}).sort((a, b) => b[1].length - a[1].length).slice(0, 6)) {
    cards.push(`<div class="look-card"><div class="look-card-title">${escapeHtml(category)}</div><div class="look-card-meta">${items.length} elementi · ${items.slice(0, 3).map(item => escapeHtml(item.name)).join(' · ')}</div></div>`);
  }
  for (const [category, count] of Object.entries(appearance.morphs?.categories || {}).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    cards.push(`<div class="look-card"><div class="look-card-title">${escapeHtml(category)}</div><div class="look-card-meta">${count} morph rilevati nella scena</div></div>`);
  }
  lookCategories.innerHTML = cards.join('');
  renderPresetCards();
}

function renderVamCatalog() {
  if (!libraryCatalog) return;
  const catalog = widgetState.vamCatalog;
  if (!catalog) {
    libraryCatalog.innerHTML = '<div class="catalog-card"><div class="catalog-card-title">Catalogo locale</div><div class="catalog-card-meta">Sto caricando i contenuti da D:\\Custom…</div></div>';
    return;
  }
  const cards = [];
  cards.push(`<span class="catalog-pill"><strong>Capelli locali</strong>${catalog.counts?.hair || 0}</span>`);
  cards.push(`<span class="catalog-pill"><strong>Abiti locali</strong>${catalog.counts?.clothing || 0}</span>`);
  cards.push(`<span class="catalog-pill"><strong>Preset persona locali</strong>${catalog.counts?.personPresets || 0}</span>`);
  cards.push(`<span class="catalog-pill"><strong>Package personaggio</strong>${catalog.counts?.varCharacters || 0}</span>`);
  if (Array.isArray(catalog.hair) && catalog.hair.length) {
    cards.push(`<div class="catalog-card"><div class="catalog-card-title">Capelli</div><div class="catalog-card-meta">${catalog.hair.slice(0, 6).map(item => escapeHtml(item.name)).join(' · ')}</div></div>`);
  }
  if (Array.isArray(catalog.personPresets) && catalog.personPresets.length) {
    cards.push(`<div class="catalog-card"><div class="catalog-card-title">Preset persona locali</div><div class="catalog-card-meta">${catalog.personPresets.slice(0, 6).map(item => `${escapeHtml(item.name)}${item.pluginCount ? ` (${item.pluginCount} plugin)` : ''}`).join(' · ')}</div></div>`);
  }
  if (Array.isArray(catalog.varCharacters) && catalog.varCharacters.length) {
    const activePackagePath = widgetState.settings?.avatar?.vamPackagePath || '';
    cards.push(...catalog.varCharacters.slice(0, 10).map(item => `
      <button class="catalog-card selectable${item.path === activePackagePath ? ' active' : ''}" type="button" data-var-package="${escapeHtml(item.path)}">
        <div class="catalog-card-title">${escapeHtml(item.name)}</div>
        <div class="catalog-card-meta">package ${escapeHtml(item.packageOwner || '')} · morph ${item.morphCount} · tex ${item.textureCount} · preset ${item.presetCount}</div>
      </button>
    `));
  }
  for (const [category, items] of Object.entries(catalog.clothingByCategory || {}).slice(0, 8)) {
    cards.push(`<div class="catalog-card"><div class="catalog-card-title">${escapeHtml(category)}</div><div class="catalog-card-meta">${items.length} asset disponibili · ${items.slice(0, 3).map(item => escapeHtml(item.name)).join(' · ')}</div></div>`);
  }
  libraryCatalog.innerHTML = cards.join('');
}

async function loadAvatarPresets() {
  const rootPath = widgetState.snapshot?.app?.avatarLibraryRoot || widgetState.settings?.avatarLibraryRoot || 'D:\\Saves\\scene';
  const scanned = await window.gemcodeCompanion.scanAvatarLibrary(rootPath);
  const quick = await window.gemcodeCompanion.listQuickVamAvatars();
  const merged = [...(scanned?.items || []), ...(quick?.items || [])];
  const unique = [];
  const seen = new Set();
  for (const item of merged) {
    if (!item?.sceneFile || seen.has(item.sceneFile)) continue;
    seen.add(item.sceneFile);
    unique.push(item);
  }
  unique.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  renderPresetOptions(unique);
  if (widgetState.snapshot || widgetState.settings) {
    await applySettings(widgetState.snapshot || widgetState.settings);
  }
}

async function loadVamCatalog() {
  widgetState.vamCatalog = await window.gemcodeCompanion.getVamAssetCatalog();
  renderVamCatalog();
}

async function selectVamCharacterPackage(packagePath) {
  const profile = getActiveProfile();
  if (!profile || !packagePath) return;
  await updateProfilePartial({
    avatar: {
      ...profile.avatar,
      vamPackagePath: packagePath,
    },
  });
}

async function selectAvatarPreset(sceneFile) {
  const preset = widgetState.avatarPresets.find(item => item.sceneFile === sceneFile);
  if (!preset) return;
  quickAvatarSelect.value = preset.sceneFile;
  renderCurrentLookDetails();
  await updateProfilePartial({
    identity: {
      ...getActiveProfile()?.identity,
      avatarName: preset.name,
    },
    avatar: {
      ...getActiveProfile()?.avatar,
      name: preset.name,
      sceneFile: preset.sceneFile,
      baseImage: preset.baseImage || preset.previewImage || getActiveProfile()?.avatar?.baseImage || '',
      blinkImage: preset.blinkImage || getActiveProfile()?.avatar?.blinkImage || '',
      mouthOpenImage: preset.mouthOpenImage || getActiveProfile()?.avatar?.mouthOpenImage || '',
      auraImage: preset.auraImage || getActiveProfile()?.avatar?.auraImage || '',
    },
  });
}

function clearAvatarImages() {
  [avatarBase, avatarBlink, avatarMouth, avatarAura].forEach(element => {
    element.hidden = true;
    element.removeAttribute('src');
  });
  syncPortraitFx();
}

async function applyAvatarPath(element, filePath) {
  if (!filePath) {
    element.hidden = true;
    element.removeAttribute('src');
    return false;
  }

  const isInlineAsset = /^data:/i.test(String(filePath || ''));
  const url = isInlineAsset ? String(filePath) : await window.gemcodeCompanion.toFileUrl(filePath);
  if (isInlineAsset) {
    element.src = url;
  } else {
    const separator = url.includes('?') ? '&' : '?';
    const bust = `${separator}rev=${Date.now().toString(36)}`;
    element.src = `${url}${bust}`;
  }
  element.hidden = false;
  syncPortraitFx();
  return true;
}

async function applySettings(settings) {
  const applyRevision = ++widgetState.applyRevision;
  widgetState.snapshot = settings?.activeProfile ? settings : widgetState.snapshot;
  const resolved = settings?.activeSettings || settings;
  widgetState.settings = resolved;

  document.documentElement.style.setProperty('--accent', resolved.widget.accentColor || '#6ee7ff');
  root.style.transform = `scale(${resolved.widget.scale || 1})`;
  statusChip.hidden = resolved.widget.showStatus === false;
  personaChip.textContent = resolved.identity?.avatarName || resolved.profileName || 'GemCode';
  ttsVoiceInput.value = resolved.tts?.voice || '';
  autoSpeakCheck.checked = resolved.tts?.autoSpeak !== false;
  scaleSlider.value = String(resolved.widget.scale ?? 1);
  opacitySlider.value = String(resolved.widget.opacity ?? 1);
  framingZoomSlider.value = String(resolved.avatar?.framingZoom ?? 1);
  framingOffsetSlider.value = String(resolved.avatar?.framingOffsetY ?? 0);
  alwaysOnTopCheck.checked = resolved.widget.alwaysOnTop !== false;
  showTranscriptCheck.checked = resolved.widget.showTranscript !== false;
  renderChatLog(widgetState.snapshot?.activeProfile?.memory?.recentMessages || []);
  renderCurrentLookDetails();
  renderVamCatalog();
  applyAvatarLayerStyles(resolved.avatar);

  const visualAvatar = resolveAvatarVisual(resolved.avatar, resolved.characterPreset);

  // Widget is transparent overlay — VAM handles all 3D rendering
  modelViewport.hidden = true;
  root.classList.remove('rendering-model');

  let hasBase = false;
  try {
    hasBase = await applyAvatarPath(avatarBase, visualAvatar.baseImage);
    if (applyRevision !== widgetState.applyRevision) return;
    await applyAvatarPath(avatarBlink, visualAvatar.blinkImage);
    if (applyRevision !== widgetState.applyRevision) return;
    await applyAvatarPath(avatarMouth, visualAvatar.mouthOpenImage);
    if (applyRevision !== widgetState.applyRevision) return;
    await applyAvatarPath(avatarAura, visualAvatar.auraImage);
    if (applyRevision !== widgetState.applyRevision) return;
  } catch (error) {
    if (applyRevision !== widgetState.applyRevision) return;
    console.error('Avatar layer error:', error);
  }

  fallbackAvatar.hidden = hasBase;
  auraLayer.hidden = Boolean(visualAvatar.auraImage);
  syncPortraitFx();
  maybeShowTranscript();
}

function applyLiveState(payload) {
  widgetState.phase = payload.phase || widgetState.phase;
  widgetState.transcript = payload.transcript || '';
  widgetState.responseText = payload.responseText || '';
  setPhase(widgetState.phase);
  maybeShowTranscript();
  // Emotions, gestures, and lip sync are handled by VAM directly
}

async function persistRecentMessages(messages) {
  await updateProfilePartial({
    memory: {
      ...(getActiveProfile()?.memory || {}),
      recentMessages: messages.slice(-24),
    },
  });
}

/* ─── Voice Recording & Transcription ─── */

let _micRecording = null;

function _concatenateFloat32(chunks) {
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Float32Array(totalLength);
  let off = 0;
  for (const c of chunks) { result.set(c, off); off += c.length; }
  return result;
}

function _encodeWav(floatBuf, sampleRate) {
  const buf = new ArrayBuffer(44 + floatBuf.length * 2);
  const v = new DataView(buf);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + floatBuf.length * 2, true);
  ws(8, 'WAVE'); ws(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  ws(36, 'data'); v.setUint32(40, floatBuf.length * 2, true);
  let off = 44;
  for (let i = 0; i < floatBuf.length; i++) {
    const s = Math.max(-1, Math.min(1, floatBuf[i]));
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([v], { type: 'audio/wav' });
}

function _blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => { const s = String(r.result || ''); const c = s.indexOf(','); resolve(c >= 0 ? s.slice(c + 1) : s); };
    r.onerror = () => reject(r.error || new Error('FileReader error'));
    r.readAsDataURL(blob);
  });
}

async function startMicRecording() {
  if (_micRecording) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    processor.onaudioprocess = e => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(processor);
    processor.connect(audioContext.destination);
    _micRecording = { stream, audioContext, processor, source, chunks };
    micButton.classList.add('recording');
    micButton.title = 'Ferma registrazione';
    setPhase('listening');
    window.gemcodeCompanion.updateWidgetLiveState({ phase: 'listening', transcript: '', responseText: '' });
  } catch (err) {
    renderSpeechBubble(`Microfono non disponibile: ${err.message}`, 'assistant');
  }
}

async function stopMicRecording() {
  if (!_micRecording) return;
  const { stream, audioContext, processor, source, chunks } = _micRecording;
  processor.disconnect();
  source.disconnect();
  stream.getTracks().forEach(t => t.stop());
  await audioContext.close();
  _micRecording = null;
  micButton.classList.remove('recording');
  micButton.title = 'Microfono';

  const floatBuf = _concatenateFloat32(chunks);
  if (floatBuf.length < 1600) { // meno di 0.1s di audio
    setPhase('idle');
    return;
  }
  const wavBlob = _encodeWav(floatBuf, 16000);
  const audioBase64 = await _blobToBase64(wavBlob);
  setPhase('thinking');
  renderSpeechBubble('Trascrizione in corso...', 'assistant');
  window.gemcodeCompanion.updateWidgetLiveState({ phase: 'thinking', transcript: 'Trascrizione...', responseText: '' });

  const bridgeUrl = widgetState.snapshot?.app?.bridgeUrl || 'http://localhost:10301';
  const profile = getRuntimeProfile();
  try {
    const response = await fetch(`${bridgeUrl}/api/companion/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio_base64: audioBase64,
        language: profile?.stt?.language || 'it',
      }),
    });
    const payload = await response.json();
    const transcript = payload.transcript || '';
    if (transcript) {
      chatInput.value = transcript;
      // Auto-send the transcription
      await sendChat(transcript);
    } else {
      renderSpeechBubble('Non ho capito, riprova.', 'assistant');
      setPhase('idle');
    }
  } catch (err) {
    renderSpeechBubble(`Trascrizione fallita: ${err.message}`, 'assistant');
    setPhase('error');
  }
}

async function sendChat(text) {
  const profile = getRuntimeProfile();
  if (!profile) return;
  const cleanText = String(text || chatInput.value || '').trim();
  if (!cleanText) return;
  const originalInputValue = chatInput.value;

  const currentMessages = [...(getActiveProfile()?.memory?.recentMessages || [])];
  const userMessage = { role: 'user', text: cleanText, ts: new Date().toISOString() };
  const pendingMessages = [...currentMessages, userMessage].slice(-24);
  renderChatLog(pendingMessages);

  renderSpeechBubble(cleanText, 'user');
  setPhase('thinking');
  window.gemcodeCompanion.updateWidgetLiveState({ phase: 'thinking', transcript: cleanText, responseText: '' });

  try {
    const response = await fetch(`${widgetState.snapshot?.app?.bridgeUrl || profile.bridgeUrl || 'http://localhost:10301'}/api/companion/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: cleanText,
        agent_url: profile.llm.agentUrl,
        model: profile.llm.model,
        system_prompt: buildCompositeSystemPrompt({
          ...profile,
          memory: { ...profile.memory, recentMessages: pendingMessages },
        }),
        temperature: Number(profile.llm.temperature),
        max_response_sentences: profile.llm.maxResponseSentences,
        max_response_chars: profile.llm.maxResponseChars,
        speak: profile.tts.autoSpeak,
        tts_provider: profile.tts.provider,
        tts_voice: profile.tts.voice,
        device_id: `desktop-companion:${profile.id}`,
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
    chatInput.value = '';
    renderChatLog(nextMessages);
    await persistRecentMessages(nextMessages);

    const liveState = {
      phase: payload.audio_url ? 'speaking' : 'idle',
      transcript: cleanText,
      responseText,
      lipSync: Boolean(payload.audio_url),
    };
    if (parsed.emotion) liveState.emotion = parsed.emotion;
    if (parsed.gestures.length > 0) liveState.gesture = parsed.gestures[0];
    window.gemcodeCompanion.updateWidgetLiveState(liveState);

    if (widgetState.activeAudio) {
      widgetState.activeAudio.pause();
      widgetState.activeAudio = null;
    }
    if (payload.audio_url) {
      playResponseAudio(payload.audio_url, cleanText, responseText);
    }
  } catch (error) {
    chatInput.value = originalInputValue;
    setPhase('error');
    renderSpeechBubble(`Chat non disponibile: ${error.message || error}`, 'assistant');
    statusChip.hidden = false;
    statusChip.textContent = `ERROR: ${error.message || error}`;
  }
}

async function init() {
  const settings = await window.gemcodeCompanion.getSettings();
  await applySettings(settings);
  await loadAvatarPresets();
  await loadVamCatalog();
  setPhase('idle');
  setChatOpen(false);

  chatFab.addEventListener('click', () => setChatOpen(true));
  chatClose.addEventListener('click', () => setChatOpen(false));
  settingsToggle.addEventListener('click', () => {
    settingsDrawer.hidden = !settingsDrawer.hidden;
  });
  sendButton.addEventListener('click', () => {
    void sendChat();
  });
  chatInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendChat();
    }
  });
  // Enable mic button and wire up voice recording
  micButton.hidden = false;
  micButton.disabled = false;
  micButton.addEventListener('click', async () => {
    if (_micRecording) {
      await stopMicRecording();
    } else {
      await startMicRecording();
    }
  });
  quickAvatarSelect.addEventListener('change', async () => {
    await selectAvatarPreset(quickAvatarSelect.value);
  });
  presetGrid?.addEventListener('click', event => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-scene]') : null;
    const sceneFile = button?.getAttribute('data-scene');
    if (!sceneFile) return;
    void selectAvatarPreset(sceneFile);
  });
  libraryCatalog?.addEventListener('click', event => {
    const button = event.target instanceof HTMLElement ? event.target.closest('[data-var-package]') : null;
    const packagePath = button?.getAttribute('data-var-package');
    if (!packagePath) return;
    void selectVamCharacterPackage(packagePath);
  });
  ttsVoiceInput.addEventListener('change', () => {
    scheduleSettingsSave(profile => ({ tts: { ...profile.tts, voice: ttsVoiceInput.value.trim() || profile.tts.voice } }));
  });
  autoSpeakCheck.addEventListener('change', () => {
    scheduleSettingsSave(profile => ({ tts: { ...profile.tts, autoSpeak: autoSpeakCheck.checked } }));
  });
  scaleSlider.addEventListener('input', () => {
    root.style.transform = `scale(${scaleSlider.value})`;
    scheduleSettingsSave(profile => ({ widget: { ...profile.widget, scale: Number(scaleSlider.value) } }));
  });
  opacitySlider.addEventListener('input', () => {
    scheduleSettingsSave(profile => ({ widget: { ...profile.widget, opacity: Number(opacitySlider.value) } }));
  });
  framingZoomSlider.addEventListener('input', () => {
    scheduleSettingsSave(profile => ({ avatar: { ...profile.avatar, framingZoom: Number(framingZoomSlider.value) } }));
  });
  framingOffsetSlider.addEventListener('input', () => {
    scheduleSettingsSave(profile => ({ avatar: { ...profile.avatar, framingOffsetY: Number(framingOffsetSlider.value) } }));
  });
  alwaysOnTopCheck.addEventListener('change', () => {
    scheduleSettingsSave(profile => ({ widget: { ...profile.widget, alwaysOnTop: alwaysOnTopCheck.checked } }));
  });
  showTranscriptCheck.addEventListener('change', () => {
    maybeShowTranscript();
    scheduleSettingsSave(profile => ({ widget: { ...profile.widget, showTranscript: showTranscriptCheck.checked } }));
  });
  testVoiceBtn?.addEventListener('click', () => {
    void sendChat('Fai un test voce rapido dicendo semplicemente ciao.');
  });
  launchVamBtn?.addEventListener('click', () => {
    void launchActiveVamScene();
  });
  openStudioBtn.addEventListener('click', async () => {
    await window.gemcodeCompanion.openStudio();
  });

  window.gemcodeCompanion.onSettingsUpdated(next => {
    void applySettings(next);
  });
  window.gemcodeCompanion.onWidgetLiveState(payload => {
    applyLiveState(payload);
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
  setPhase('error');
  statusChip.textContent = `ERROR: ${error.message}`;
});