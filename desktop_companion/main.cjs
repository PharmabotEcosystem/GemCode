const { app, BrowserWindow, dialog, ipcMain, screen } = require('electron');
const fs = require('fs');
const path = require('path');

const APP_ID = 'gemcode.desktop.companion';
const STORE_SCHEMA_VERSION = 2;

const DEFAULT_WIDGET_SETTINGS = {
  width: 540,
  height: 760,
  opacity: 1,
  scale: 1,
  alwaysOnTop: true,
  clickThrough: false,
  showTranscript: true,
  showStatus: true,
  accentColor: '#6ee7ff',
  x: null,
  y: null,
};

const DEFAULT_AVATAR_SETTINGS = {
  name: 'Lana',
  baseImage: '',
  blinkImage: '',
  mouthOpenImage: '',
  auraImage: '',
  primaryModel: 'D:\\Avatar3D\\j.obj',
  sceneFile: 'D:\\Saves\\scene\\SPQR\\lana.json',
  idleAnimation: 'breathe',
};

const DEFAULT_PROFILE = {
  id: 'profile-default',
  name: 'Lana',
  slug: 'lana',
  identity: {
    avatarName: 'Lana',
    interlocutorName: 'Tu',
    avatarAge: '26',
    interlocutorAge: '',
    role: 'Companion desktop personale',
    relationship: 'alleata operativa quotidiana',
    biography: '',
    styleKeywords: 'calda, precisa, elegante, protettiva',
    notes: '',
  },
  avatar: DEFAULT_AVATAR_SETTINGS,
  llm: {
    agentUrl: 'http://localhost:11434/api/chat',
    model: 'gemma4',
    systemPrompt:
      'Sei GemCode Companion, un avatar desktop realistico, elegante e utile. Rispondi in italiano, in modo caldo ma preciso. Resta breve e naturale nel parlato.',
    temperature: 0.55,
    maxResponseSentences: 3,
    maxResponseChars: 280,
  },
  tts: {
    provider: 'edge-tts',
    voice: 'it-IT-ElsaNeural',
    autoSpeak: true,
  },
  stt: {
    provider: 'bridge-whisper',
    language: 'it',
    autoSendVoice: true,
    mode: 'push-to-talk',
  },
  behavior: {
    conversationStyle: 'calda ma precisa',
    initiative: 'balanced',
    humor: 'low',
    expressiveness: 'medium',
    boundaries: 'Non inventare fatti. Se un permesso e negato, dichiaralo chiaramente e proponi alternative sicure.',
    greeting: '',
    farewell: '',
    traits: 'Osserva il contesto desktop quando autorizzata. Mantieni tono naturale, sintetico e credibile.',
  },
  permissions: {
    pcControl: 'ask',
    screenRead: 'allow',
    webcam: 'deny',
    fileAccess: 'ask',
    browserAutomation: 'ask',
    microphone: 'allow',
    notifications: 'allow',
  },
  memory: {
    summary: '',
    pinnedNotes: '',
    knownFacts: '',
    privateNotes: '',
    recentMessages: [],
  },
  widget: DEFAULT_WIDGET_SETTINGS,
  metadata: {
    createdAt: '',
    updatedAt: '',
  },
};

const DEFAULT_STORE = {
  schemaVersion: STORE_SCHEMA_VERSION,
  avatarLibraryRoot: 'D:\\Saves\\scene',
  bridgeUrl: 'http://localhost:10301',
  activeProfileId: DEFAULT_PROFILE.id,
  profiles: [DEFAULT_PROFILE],
};

const IMAGE_EXTENSIONS = new Set(['.png', '.webp', '.jpg', '.jpeg']);
const MODEL_EXTENSIONS = new Set(['.vrm', '.glb', '.gltf', '.fbx', '.obj']);
const VAM_SCENE_ROOTS = [
  'D:\\Saves\\scene',
  'D:\\Saves\\Person',
];
const SKIP_FOLDERS = new Set([
  '$RECYCLE.BIN',
  'System Volume Information',
  'WindowsApps',
  'steamapps',
  'node_modules',
  '.git',
  '__pycache__',
  '.claude',
  'Cache',
  'logs',
  'Temp',
]);

let widgetWindow = null;
let studioWindow = null;
let store = null;

function getStorePath() {
  return path.join(app.getPath('userData'), 'gemcode-companion-settings.json');
}

function mergeDeep(base, override) {
  if (Array.isArray(base)) {
    return Array.isArray(override) ? override.slice() : base.slice();
  }
  if (!base || typeof base !== 'object') {
    return override === undefined ? base : override;
  }

  const next = { ...base };
  const source = override && typeof override === 'object' ? override : {};
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && next[key] && typeof next[key] === 'object') {
      next[key] = mergeDeep(next[key], value);
    } else {
      next[key] = value;
    }
  }
  return next;
}

function deepClone(value) {
  return structuredClone(value);
}

function createId() {
  return `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'profilo';
}

function normalizeRecentMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(message => message && typeof message === 'object')
    .map(message => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      text: String(message.text || '').trim(),
      ts: String(message.ts || new Date().toISOString()),
    }))
    .filter(message => message.text)
    .slice(-24);
}

function createDefaultProfile(overrides = {}) {
  const createdAt = new Date().toISOString();
  const merged = mergeDeep(deepClone(DEFAULT_PROFILE), overrides || {});
  const name = String(merged.name || merged.identity?.avatarName || 'Nuovo Profilo').trim() || 'Nuovo Profilo';
  merged.id = String(merged.id || createId());
  merged.name = name;
  merged.slug = slugify(merged.slug || name);
  merged.identity.avatarName = String(merged.identity.avatarName || name).trim() || name;
  merged.avatar.name = String(merged.avatar.name || merged.identity.avatarName || name).trim() || name;
  merged.memory.recentMessages = normalizeRecentMessages(merged.memory.recentMessages);
  merged.metadata.createdAt = merged.metadata.createdAt || createdAt;
  merged.metadata.updatedAt = createdAt;
  return merged;
}

function migrateLegacySettings(legacy) {
  const profileName = String(legacy.avatar?.name || 'GemCode Default').trim() || 'GemCode Default';
  const migratedProfile = createDefaultProfile({
    id: 'profile-legacy-default',
    name: profileName,
    slug: slugify(profileName),
    identity: {
      avatarName: profileName,
    },
    avatar: legacy.avatar || {},
    llm: {
      agentUrl: legacy.agentUrl,
      model: legacy.model,
      systemPrompt: legacy.systemPrompt,
      temperature: legacy.temperature,
      maxResponseSentences: legacy.maxResponseSentences,
      maxResponseChars: legacy.maxResponseChars,
    },
    tts: {
      provider: legacy.ttsProvider,
      voice: legacy.ttsVoice,
      autoSpeak: legacy.autoSpeak,
    },
    stt: {
      autoSendVoice: legacy.autoSendVoice,
    },
    widget: legacy.widget || {},
  });

  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    avatarLibraryRoot: String(legacy.avatarLibraryRoot || DEFAULT_STORE.avatarLibraryRoot),
    bridgeUrl: String(legacy.bridgeUrl || DEFAULT_STORE.bridgeUrl),
    activeProfileId: migratedProfile.id,
    profiles: [migratedProfile],
  };
}

function normalizeProfile(profile, index = 0) {
  const merged = mergeDeep(deepClone(DEFAULT_PROFILE), profile || {});
  const name = String(merged.name || merged.identity?.avatarName || `Profilo ${index + 1}`).trim() || `Profilo ${index + 1}`;
  merged.id = String(merged.id || createId());
  merged.name = name;
  merged.slug = slugify(merged.slug || name);
  merged.identity.avatarName = String(merged.identity.avatarName || name).trim() || name;
  merged.avatar.name = String(merged.avatar.name || merged.identity.avatarName || name).trim() || name;
  merged.memory.recentMessages = normalizeRecentMessages(merged.memory.recentMessages);
  merged.metadata.createdAt = merged.metadata.createdAt || new Date().toISOString();
  merged.metadata.updatedAt = new Date().toISOString();
  return merged;
}

function normalizeStore(inputStore) {
  const raw = inputStore && typeof inputStore === 'object' ? inputStore : {};
  const base = raw.profiles ? raw : migrateLegacySettings(raw);
  const merged = mergeDeep(deepClone(DEFAULT_STORE), base);
  merged.schemaVersion = STORE_SCHEMA_VERSION;
  merged.avatarLibraryRoot = String(merged.avatarLibraryRoot || DEFAULT_STORE.avatarLibraryRoot);
  merged.bridgeUrl = String(merged.bridgeUrl || DEFAULT_STORE.bridgeUrl);
  merged.profiles = (Array.isArray(merged.profiles) ? merged.profiles : [deepClone(DEFAULT_PROFILE)]).map(normalizeProfile);
  if (merged.profiles.length === 0) {
    merged.profiles = [createDefaultProfile()];
  }
  if (!merged.profiles.some(profile => profile.id === merged.activeProfileId)) {
    merged.activeProfileId = merged.profiles[0].id;
  }
  return merged;
}

function loadSettings() {
  const storePath = getStorePath();
  try {
    if (fs.existsSync(storePath)) {
      const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      return normalizeStore(parsed);
    }
  } catch (error) {
    console.error('Failed to read companion settings:', error);
  }
  return normalizeStore(DEFAULT_STORE);
}

function saveSettings() {
  const storePath = getStorePath();
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
}

function getDisplayBounds() {
  return screen.getPrimaryDisplay().workArea;
}

function getActiveProfile() {
  return store.profiles.find(profile => profile.id === store.activeProfileId) || store.profiles[0];
}

function ensureWidgetPosition(profile = getActiveProfile()) {
  const bounds = getDisplayBounds();
  if (typeof profile.widget.x !== 'number') {
    profile.widget.x = bounds.x + bounds.width - profile.widget.width - 48;
  }
  if (typeof profile.widget.y !== 'number') {
    profile.widget.y = bounds.y + Math.max(36, Math.round((bounds.height - profile.widget.height) * 0.32));
  }
  const maxX = bounds.x + Math.max(0, bounds.width - profile.widget.width);
  const maxY = bounds.y + Math.max(0, bounds.height - profile.widget.height);
  profile.widget.x = Math.min(Math.max(profile.widget.x, bounds.x), maxX);
  profile.widget.y = Math.min(Math.max(profile.widget.y, bounds.y), maxY);
}

function buildRuntimeSettings(profile = getActiveProfile()) {
  return {
    bridgeUrl: store.bridgeUrl,
    avatarLibraryRoot: store.avatarLibraryRoot,
    profileId: profile.id,
    profileName: profile.name,
    identity: deepClone(profile.identity),
    avatar: deepClone(profile.avatar),
    llm: deepClone(profile.llm),
    tts: deepClone(profile.tts),
    stt: deepClone(profile.stt),
    behavior: deepClone(profile.behavior),
    permissions: deepClone(profile.permissions),
    memory: deepClone(profile.memory),
    widget: deepClone(profile.widget),
    agentUrl: profile.llm.agentUrl,
    model: profile.llm.model,
    systemPrompt: profile.llm.systemPrompt,
    temperature: profile.llm.temperature,
    maxResponseSentences: profile.llm.maxResponseSentences,
    maxResponseChars: profile.llm.maxResponseChars,
    ttsProvider: profile.tts.provider,
    ttsVoice: profile.tts.voice,
    autoSpeak: profile.tts.autoSpeak,
    autoSendVoice: profile.stt.autoSendVoice,
  };
}

function buildStateSnapshot() {
  const activeProfile = getActiveProfile();
  return {
    app: {
      schemaVersion: store.schemaVersion,
      avatarLibraryRoot: store.avatarLibraryRoot,
      bridgeUrl: store.bridgeUrl,
      activeProfileId: activeProfile.id,
    },
    profiles: deepClone(store.profiles),
    activeProfileId: activeProfile.id,
    activeProfile: deepClone(activeProfile),
    activeSettings: buildRuntimeSettings(activeProfile),
  };
}

function createWidgetWindow() {
  const activeProfile = getActiveProfile();
  ensureWidgetPosition(activeProfile);
  widgetWindow = new BrowserWindow({
    width: activeProfile.widget.width,
    height: activeProfile.widget.height,
    x: activeProfile.widget.x,
    y: activeProfile.widget.y,
    frame: false,
    transparent: true,
    resizable: true,
    movable: true,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  widgetWindow.loadFile(path.join(__dirname, 'widget.html'));
  widgetWindow.setMenuBarVisibility(false);

  widgetWindow.on('move', () => {
    if (!widgetWindow) return;
    const activeProfile = getActiveProfile();
    const [x, y] = widgetWindow.getPosition();
    activeProfile.widget.x = x;
    activeProfile.widget.y = y;
    saveSettings();
  });

  widgetWindow.on('resize', () => {
    if (!widgetWindow) return;
    const activeProfile = getActiveProfile();
    const [width, height] = widgetWindow.getSize();
    activeProfile.widget.width = width;
    activeProfile.widget.height = height;
    saveSettings();
    broadcastSettings();
  });

  widgetWindow.on('closed', () => {
    widgetWindow = null;
  });

  applyWidgetSettings();
}

function createStudioWindow() {
  studioWindow = new BrowserWindow({
    width: 1360,
    height: 940,
    minWidth: 1120,
    minHeight: 760,
    backgroundColor: '#08111a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  studioWindow.loadFile(path.join(__dirname, 'studio.html'));
  studioWindow.on('closed', () => {
    studioWindow = null;
  });
}

function syncWidgetWindowToActiveProfile() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const activeProfile = getActiveProfile();
  ensureWidgetPosition(activeProfile);
  widgetWindow.setBounds({
    x: activeProfile.widget.x,
    y: activeProfile.widget.y,
    width: activeProfile.widget.width,
    height: activeProfile.widget.height,
  }, false);
  applyWidgetSettings();
}

function applyWidgetSettings() {
  if (!widgetWindow) return;
  const activeProfile = getActiveProfile();
  widgetWindow.setAlwaysOnTop(Boolean(activeProfile.widget.alwaysOnTop), 'screen-saver');
  widgetWindow.setIgnoreMouseEvents(Boolean(activeProfile.widget.clickThrough), { forward: true });
  widgetWindow.setOpacity(Number(activeProfile.widget.opacity ?? 1));
}

function broadcastSettings() {
  const snapshot = buildStateSnapshot();
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send('companion:settings-updated', snapshot);
  }
  if (studioWindow && !studioWindow.isDestroyed()) {
    studioWindow.webContents.send('companion:settings-updated', snapshot);
  }
}

function routeWidgetState(payload) {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send('companion:widget-live-state', payload);
  }
}

function normalizeFilePath(filePath) {
  if (!filePath) return '';
  const normalized = filePath.replace(/\\/g, '/');
  return `file:///${encodeURI(normalized)}`;
}

function safeReaddir(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function parseVamSceneFile(filePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!raw.atoms || !Array.isArray(raw.atoms)) return null;

    const personAtom = raw.atoms.find(a => a.type === 'Person');
    if (!personAtom) return null;

    let characterName = '';
    if (Array.isArray(personAtom.storables)) {
      const geometry = personAtom.storables.find(s => s.id === 'geometry');
      if (geometry) {
        characterName = geometry.character || '';
      }
    }

    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath, '.json');

    let previewImage = '';
    for (const ext of ['.jpg', '.png', '.webp']) {
      const imgPath = path.join(dir, baseName + ext);
      if (fs.existsSync(imgPath)) {
        previewImage = imgPath;
        break;
      }
    }

    return {
      name: baseName,
      sceneFile: filePath,
      folderPath: dir,
      previewImage,
      characterName,
      personAtomId: personAtom.id || 'Person',
      compatibility: 'vam-scene',
    };
  } catch {
    return null;
  }
}

function scanVamPresets(rootPath, maxDepth = 4) {
  const results = [];
  const queue = [{ dirPath: rootPath, depth: 0 }];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.dirPath)) continue;
    visited.add(current.dirPath);

    const entries = safeReaddir(current.dirPath);

    for (const entry of entries) {
      const fullPath = path.join(current.dirPath, entry.name);

      if (entry.isDirectory()) {
        if (current.depth < maxDepth && !SKIP_FOLDERS.has(entry.name)) {
          queue.push({ dirPath: fullPath, depth: current.depth + 1 });
        }
        continue;
      }

      if (path.extname(entry.name).toLowerCase() !== '.json') continue;

      const preset = parseVamSceneFile(fullPath);
      if (preset) {
        results.push(preset);
      }
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 100);
}

function getQuickVamPresets() {
  const results = [];
  for (const rootDir of VAM_SCENE_ROOTS) {
    if (!fs.existsSync(rootDir)) continue;
    results.push(...scanVamPresets(rootDir, 2));
  }
  const seen = new Set();
  return results.filter(item => {
    if (seen.has(item.sceneFile)) return false;
    seen.add(item.sceneFile);
    return true;
  });
}

function updateProfile(profileId, partial) {
  const profileIndex = store.profiles.findIndex(profile => profile.id === profileId);
  if (profileIndex < 0) {
    throw new Error(`Profilo non trovato: ${profileId}`);
  }

  const currentProfile = store.profiles[profileIndex];
  const nextProfile = normalizeProfile(mergeDeep(currentProfile, partial || {}), profileIndex);
  store.profiles.splice(profileIndex, 1, nextProfile);
  if (store.activeProfileId === profileId) {
    syncWidgetWindowToActiveProfile();
  }
  saveSettings();
  applyWidgetSettings();
  broadcastSettings();
  return buildStateSnapshot();
}

function makeImportedProfileSeed(rawProfile) {
  const imported = createDefaultProfile(rawProfile || {});
  imported.id = createId();
  imported.slug = slugify(imported.slug || imported.name);
  imported.metadata.createdAt = new Date().toISOString();
  imported.metadata.updatedAt = imported.metadata.createdAt;
  return imported;
}

function extractImportedProfiles(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Formato profilo non valido.');
  }

  if (Array.isArray(payload.profiles)) {
    return payload.profiles.map(makeImportedProfileSeed);
  }

  if (payload.profile && typeof payload.profile === 'object') {
    return [makeImportedProfileSeed(payload.profile)];
  }

  return [makeImportedProfileSeed(payload)];
}

app.whenReady().then(() => {
  app.setAppUserModelId(APP_ID);
  store = loadSettings();
  createWidgetWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWidgetWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('companion:get-settings', async () => buildStateSnapshot());

ipcMain.handle('companion:save-app-settings', async (_event, partial) => {
  store = normalizeStore(mergeDeep(store, partial || {}));
  saveSettings();
  syncWidgetWindowToActiveProfile();
  applyWidgetSettings();
  broadcastSettings();
  return buildStateSnapshot();
});

ipcMain.handle('companion:update-profile', async (_event, profileId, partial) => updateProfile(profileId, partial));

ipcMain.handle('companion:create-profile', async (_event, seed) => {
  const nextProfile = createDefaultProfile(seed || {});
  nextProfile.id = createId();
  nextProfile.name = String(seed?.name || 'Nuovo Profilo').trim() || 'Nuovo Profilo';
  nextProfile.slug = slugify(seed?.slug || nextProfile.name);
  nextProfile.identity.avatarName = String(seed?.identity?.avatarName || 'Nuovo Avatar').trim() || 'Nuovo Avatar';
  nextProfile.avatar.name = nextProfile.identity.avatarName;
  nextProfile.memory.recentMessages = [];
  nextProfile.metadata.createdAt = new Date().toISOString();
  nextProfile.metadata.updatedAt = nextProfile.metadata.createdAt;
  store.profiles.push(nextProfile);
  store.activeProfileId = nextProfile.id;
  saveSettings();
  syncWidgetWindowToActiveProfile();
  applyWidgetSettings();
  broadcastSettings();
  return buildStateSnapshot();
});

ipcMain.handle('companion:duplicate-profile', async (_event, profileId) => {
  const source = store.profiles.find(profile => profile.id === profileId) || getActiveProfile();
  const duplicate = createDefaultProfile(deepClone(source));
  duplicate.id = createId();
  duplicate.name = `${source.name} Copy`;
  duplicate.slug = slugify(duplicate.name);
  duplicate.memory.recentMessages = [];
  duplicate.metadata.createdAt = new Date().toISOString();
  duplicate.metadata.updatedAt = duplicate.metadata.createdAt;
  store.profiles.push(duplicate);
  store.activeProfileId = duplicate.id;
  saveSettings();
  syncWidgetWindowToActiveProfile();
  applyWidgetSettings();
  broadcastSettings();
  return buildStateSnapshot();
});

ipcMain.handle('companion:delete-profile', async (_event, profileId) => {
  if (store.profiles.length <= 1) {
    throw new Error('Devi mantenere almeno un profilo.');
  }

  const nextProfiles = store.profiles.filter(profile => profile.id !== profileId);
  if (nextProfiles.length === store.profiles.length) {
    throw new Error(`Profilo non trovato: ${profileId}`);
  }

  store.profiles = nextProfiles;
  if (!store.profiles.some(profile => profile.id === store.activeProfileId)) {
    store.activeProfileId = store.profiles[0].id;
  }
  saveSettings();
  syncWidgetWindowToActiveProfile();
  applyWidgetSettings();
  broadcastSettings();
  return buildStateSnapshot();
});

ipcMain.handle('companion:set-active-profile', async (_event, profileId) => {
  if (!store.profiles.some(profile => profile.id === profileId)) {
    throw new Error(`Profilo non trovato: ${profileId}`);
  }

  store.activeProfileId = profileId;
  saveSettings();
  syncWidgetWindowToActiveProfile();
  applyWidgetSettings();
  broadcastSettings();
  return buildStateSnapshot();
});

ipcMain.handle('companion:export-profile', async (_event, profileId) => {
  const profile = store.profiles.find(item => item.id === profileId) || getActiveProfile();
  const defaultFileName = `${slugify(profile.name || profile.identity?.avatarName || 'profilo')}.gemprofile.json`;
  const result = await dialog.showSaveDialog({
    title: 'Esporta profilo GemCode',
    defaultPath: defaultFileName,
    filters: [
      { name: 'GemCode Profile', extensions: ['json', 'gemprofile.json'] },
      { name: 'JSON', extensions: ['json'] },
    ],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  const payload = {
    kind: 'gemcode-profile',
    schemaVersion: STORE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    profile: deepClone(profile),
  };
  fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8');
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle('companion:import-profile', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Importa profilo GemCode',
    properties: ['openFile'],
    filters: [
      { name: 'GemCode Profile', extensions: ['json', 'gemprofile.json'] },
      { name: 'JSON', extensions: ['json'] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, snapshot: buildStateSnapshot() };
  }

  const importedPath = result.filePaths[0];
  const raw = JSON.parse(fs.readFileSync(importedPath, 'utf8'));
  const importedProfiles = extractImportedProfiles(raw);
  store.profiles.push(...importedProfiles);
  store.activeProfileId = importedProfiles[importedProfiles.length - 1].id;
  saveSettings();
  syncWidgetWindowToActiveProfile();
  applyWidgetSettings();
  broadcastSettings();
  return {
    canceled: false,
    importedCount: importedProfiles.length,
    filePath: importedPath,
    snapshot: buildStateSnapshot(),
  };
});

ipcMain.handle('companion:pick-avatar-file', async (_event, kind) => {
  let filters;
  if (kind === 'primaryModel') {
    filters = [
      { name: 'Modelli 3D', extensions: ['vrm', 'glb', 'gltf', 'fbx', 'obj'] },
      { name: 'Tutti i file', extensions: ['*'] },
    ];
  } else if (kind === 'sceneFile') {
    filters = [
      { name: 'Scene VAM (JSON)', extensions: ['json'] },
      { name: 'Tutti i file', extensions: ['*'] },
    ];
  } else {
    filters = [
      { name: 'Immagini', extensions: ['png', 'webp', 'jpg', 'jpeg'] },
      { name: 'Tutti i file', extensions: ['*'] },
    ];
  }

  const result = await dialog.showOpenDialog({
    title: `Seleziona file avatar ${kind}`,
    properties: ['openFile'],
    filters,
  });

  if (result.canceled || result.filePaths.length === 0) {
    return '';
  }
  return result.filePaths[0];
});

ipcMain.handle('companion:pick-avatar-root', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Seleziona la cartella radice personaggi',
    defaultPath: store.avatarLibraryRoot || 'D:\\',
    properties: ['openDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return '';
  }

  store.avatarLibraryRoot = result.filePaths[0];
  saveSettings();
  broadcastSettings();
  return result.filePaths[0];
});

ipcMain.handle('companion:scan-avatar-library', async (_event, rootPath) => {
  const targetRoot = (rootPath || store.avatarLibraryRoot || 'D:\\Saves\\scene').trim();
  return {
    rootPath: targetRoot,
    items: scanVamPresets(targetRoot, 4),
  };
});

ipcMain.handle('companion:list-quick-vam-avatars', async () => ({
  items: getQuickVamPresets(),
}));

ipcMain.handle('companion:to-file-url', async (_event, filePath) => normalizeFilePath(filePath));

ipcMain.handle('companion:focus-widget', async () => {
  if (!widgetWindow || widgetWindow.isDestroyed()) {
    createWidgetWindow();
    syncWidgetWindowToActiveProfile();
    broadcastSettings();
    return;
  }
  const activeProfile = getActiveProfile();
  ensureWidgetPosition(activeProfile);
  widgetWindow.setBounds({
    x: activeProfile.widget.x,
    y: activeProfile.widget.y,
    width: activeProfile.widget.width,
    height: activeProfile.widget.height,
  }, false);
  if (widgetWindow.isMinimized()) {
    widgetWindow.restore();
  }
  widgetWindow.setAlwaysOnTop(Boolean(activeProfile.widget.alwaysOnTop), 'screen-saver');
  widgetWindow.setIgnoreMouseEvents(false);
  widgetWindow.show();
  widgetWindow.focus();
  widgetWindow.moveTop();
  syncWidgetWindowToActiveProfile();
  broadcastSettings();
});

ipcMain.handle('companion:open-studio', async () => {
  if (!studioWindow || studioWindow.isDestroyed()) {
    createStudioWindow();
  }
  if (studioWindow.isMinimized()) {
    studioWindow.restore();
  }
  studioWindow.show();
  studioWindow.focus();
  studioWindow.moveTop();
  broadcastSettings();
});

ipcMain.handle('companion:toggle-click-through', async (_event, enabled) => {
  const activeProfile = getActiveProfile();
  activeProfile.widget.clickThrough = Boolean(enabled);
  saveSettings();
  applyWidgetSettings();
  broadcastSettings();
  return activeProfile.widget.clickThrough;
});

ipcMain.on('companion:update-widget-live-state', (_event, payload) => {
  routeWidgetState(payload);
});