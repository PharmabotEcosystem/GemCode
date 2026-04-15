const { app, BrowserWindow, dialog, ipcMain, screen } = require('electron');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const APP_ID = 'gemcode.desktop.companion';
const DEBUG_LOG = path.join(__dirname, 'debug.log');
try { fs.writeFileSync(DEBUG_LOG, `--- GemCode debug start ${new Date().toISOString()} ---\n`); } catch (_) {}
process.on('uncaughtException', (err) => { try { fs.appendFileSync(DEBUG_LOG, `[MAIN] uncaughtException: ${err.stack || err}\n`); } catch (_) {} });
process.on('unhandledRejection', (reason) => { try { fs.appendFileSync(DEBUG_LOG, `[MAIN] unhandledRejection: ${reason}\n`); } catch (_) {} });
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

const DEFAULT_CHARACTER_PRESET = {
  sourceScene: 'D:\\Saves\\scene\\SPQR\\lana.json',
  characterBase: 'Tara',
  skinPackage: '',
  clothing: [],
  hair: [],
  morphOverrides: {},
  skinColor: { h: 0, s: 0, v: 1 },
};

const DEFAULT_AVATAR_SETTINGS = {
  name: 'Lana',
  baseImage: '',
  blinkImage: '',
  mouthOpenImage: '',
  auraImage: '',
  vamPackagePath: '',
  primaryModel: '',
  sceneFile: 'D:\\Saves\\scene\\SPQR\\lana.json',
  idleAnimation: 'breathe',
  framingZoom: 1,
  framingOffsetY: 0,
  layerLayout: {
    base: { offsetX: 0, offsetY: 0, scale: 1 },
    blink: { offsetX: 0, offsetY: 0, scale: 1 },
    mouth: { offsetX: 0, offsetY: 0, scale: 1 },
    aura: { offsetX: 0, offsetY: 0, scale: 1 },
  },
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
  characterPreset: deepClone(DEFAULT_CHARACTER_PRESET),
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
  vam: {
    exePath: '',
    autoLaunch: false,
  },
  activeProfileId: DEFAULT_PROFILE.id,
  profiles: [DEFAULT_PROFILE],
};

const IMAGE_EXTENSIONS = new Set(['.png', '.webp', '.jpg', '.jpeg']);
const MODEL_EXTENSIONS = new Set(['.vrm', '.glb', '.gltf', '.fbx', '.obj']);
const VAM_SCENE_ROOTS = [
  'D:\\Saves\\scene',
  'D:\\Saves\\Person',
];
const VAM_HAIR_ROOTS = [
  'D:\\Custom\\Hair\\Female',
  'D:\\Custom\\Hair\\Male',
];
const VAM_PERSON_PRESET_ROOTS = [
  'D:\\Custom\\Atom\\Person\\General',
  'D:\\Custom\\Atom\\Person\\PluginPresets',
];
const VAM_CLOTHING_ROOTS = [
  'D:\\Custom\\Clothing\\Female',
  'D:\\Custom\\Clothing\\Male',
  'D:\\Custom\\Clothing\\Neutral',
];
const VAM_PACKAGE_ROOT = 'D:\\AddonPackages';
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
let vamAssetCatalogCache = null;
const vamPackageResolutionCache = new Map();

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

  // No 3D model in widget — VAM handles rendering
  merged.avatar.primaryModel = '';

  return merged;
}

function normalizeStore(inputStore) {
  const raw = inputStore && typeof inputStore === 'object' ? inputStore : {};
  const base = raw.profiles ? raw : migrateLegacySettings(raw);
  const merged = mergeDeep(deepClone(DEFAULT_STORE), base);
  merged.schemaVersion = STORE_SCHEMA_VERSION;
  merged.avatarLibraryRoot = String(merged.avatarLibraryRoot || DEFAULT_STORE.avatarLibraryRoot);
  merged.bridgeUrl = String(merged.bridgeUrl || DEFAULT_STORE.bridgeUrl);
  merged.vam = mergeDeep(deepClone(DEFAULT_STORE.vam), merged.vam || {});
  merged.vam.exePath = String(merged.vam.exePath || '').trim();
  merged.vam.autoLaunch = Boolean(merged.vam.autoLaunch);
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
    characterPreset: deepClone(profile.characterPreset),
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
      vam: deepClone(store.vam || DEFAULT_STORE.vam),
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
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  widgetWindow.loadFile(path.join(__dirname, 'widget.html'));
  widgetWindow.setMenuBarVisibility(false);
  widgetWindow.webContents.on('console-message', (event) => {
    const fs = require('fs');
    fs.appendFileSync(path.join(__dirname, 'debug.log'), `[Widget:${event.level}] ${event.message}\n`);
  });
  widgetWindow.webContents.on('render-process-gone', (event, details) => {
    const fs = require('fs');
    fs.appendFileSync(path.join(__dirname, 'debug.log'), `[Widget] CRASHED: ${JSON.stringify(details)}\n`);
  });

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
  studioWindow.webContents.on('console-message', (event) => {
    const fs = require('fs');
    fs.appendFileSync(path.join(__dirname, 'debug.log'), `[Studio:${event.level}] ${event.message}\n`);
  });
  studioWindow.webContents.on('render-process-gone', (event, details) => {
    const fs = require('fs');
    fs.appendFileSync(path.join(__dirname, 'debug.log'), `[Studio] CRASHED: ${JSON.stringify(details)}\n`);
  });
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

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeLabel(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyClothingCategory(input) {
  const text = normalizeLabel(input).toLowerCase();
  if (!text) return 'outfit';
  if (/(shoe|boot|heel|sandal|sole|sneaker|footwear)/.test(text)) return 'scarpe';
  if (/(pant|jean|trouser|legging|short|brief|bottom|bikini bottom)/.test(text)) return 'pantaloni';
  if (/(skirt|dress|gown)/.test(text)) return 'gonna';
  if (/(sock|stocking|tight|legging|pantyhose)/.test(text)) return 'calze';
  if (/(bra|panty|panties|underwear|lingerie|bikini|thong|intim)/.test(text)) return 'intimo';
  if (/(shirt|top|jacket|coat|hoodie|corset|sweater|sleeve|blouse)/.test(text)) return 'top';
  if (/(glove|bracelet|ring|earring|necklace|choker|pin|ornament|hairpin|belt|mask|glasses|goggle|accessory|flower)/.test(text)) return 'accessori';
  if (/(nail|eye|eyeball|glitter|makeup|lash|brow|tattoo)/.test(text)) return 'viso e dettagli';
  return 'outfit';
}

function classifyMorphCategory(name) {
  const text = normalizeLabel(name).toLowerCase();
  if (!text) return 'altro';
  if (/(eye|eyelid|iris|pupil|lash|brow)/.test(text)) return 'occhi';
  if (/(nose|nostril)/.test(text)) return 'naso';
  if (/(mouth|lip|tongue|smile|frown|jaw|teeth|chin)/.test(text)) return 'bocca';
  if (/(skin|tan|gloss|subsurface|makeup|tattoo|freckle)/.test(text)) return 'pelle';
  if (/(breast|nipple|boob)/.test(text)) return 'seno';
  if (/(waist|hip|thigh|leg|arm|shoulder|body|torso|abdomen|butt|glute|physique|scale|muscle)/.test(text)) return 'fisico';
  if (/(hand|finger|thumb|pose|grasp|salute|fist)/.test(text)) return 'mani e posa';
  if (/(face|cheek|forehead|ear|head)/.test(text)) return 'volto';
  return 'altro';
}

function pickDisplayNameFromPath(filePath) {
  return normalizeLabel(path.basename(String(filePath || ''), path.extname(String(filePath || ''))));
}

function pickDisplayNameFromVarFile(filePath) {
  const stem = path.basename(String(filePath || ''), '.var');
  const parts = stem.split('.').filter(Boolean);
  if (parts.length >= 2) {
    return normalizeLabel(parts.slice(1, -1).join(' ') || parts[1]);
  }
  return normalizeLabel(stem);
}

function sanitizeCacheName(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'package';
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function getVamPackageCacheRoot() {
  return ensureDirectory(path.join(app.getPath('userData'), 'vam-package-cache'));
}

function findPreferredVarEntry(entries, patterns) {
  for (const pattern of patterns) {
    const match = entries.find(entry => pattern.test(entry.entryName));
    if (match) return match;
  }
  return null;
}

function extractVarEntryToCache(zip, entry, targetDir) {
  if (!entry) return '';
  const targetPath = path.join(targetDir, path.basename(entry.entryName));
  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, entry.getData());
  }
  return targetPath;
}

function resolveVarCharacterPackage(packagePath) {
  const normalizedPath = String(packagePath || '').trim();
  if (!normalizedPath || !fs.existsSync(normalizedPath)) {
    return null;
  }
  const stat = fs.statSync(normalizedPath);
  const cacheKey = `${normalizedPath}:${stat.mtimeMs}`;
  if (vamPackageResolutionCache.has(cacheKey)) {
    return vamPackageResolutionCache.get(cacheKey);
  }

  try {
    const zip = new AdmZip(normalizedPath);
    const entries = zip.getEntries();
    const cacheDir = ensureDirectory(path.join(getVamPackageCacheRoot(), sanitizeCacheName(path.basename(normalizedPath, '.var'))));
    const faceDiffuse = findPreferredVarEntry(entries, [
      /Textures\/.+\/(?:FACE D\d*|G2_Face|FaceG|faceD|HeadD)[^/]*\.(?:png|jpe?g|webp)$/i,
    ]);
    const faceNormal = findPreferredVarEntry(entries, [
      /Textures\/.+\/(?:FACE N\d*|faceN|HeadN)[^/]*\.(?:png|jpe?g|webp)$/i,
    ]);
    const torsoDiffuse = findPreferredVarEntry(entries, [
      /Textures\/.+\/(?:TORSO D[^/]*|G2_Torso|torsoD)[^/]*\.(?:png|jpe?g|webp)$/i,
    ]);
    const torsoNormal = findPreferredVarEntry(entries, [
      /Textures\/.+\/(?:TORSO N[^/]*|torsoN)[^/]*\.(?:png|jpe?g|webp)$/i,
    ]);
    const limbsDiffuse = findPreferredVarEntry(entries, [
      /Textures\/.+\/(?:LIMBS D[^/]*|G2_Limbs|limbsD)[^/]*\.(?:png|jpe?g|webp)$/i,
    ]);
    const limbsNormal = findPreferredVarEntry(entries, [
      /Textures\/.+\/(?:LIMBS N[^/]*|limbsN)[^/]*\.(?:png|jpe?g|webp)$/i,
    ]);
    const previewEntry = faceDiffuse || torsoDiffuse || limbsDiffuse;
    const presetEntry = findPreferredVarEntry(entries, [
      /Custom\/Atom\/Person\/Appearance\/.+\.(?:vap|json)$/i,
      /Custom\/Atom\/Person\/Skin\/.+\.(?:vap|json)$/i,
      /Custom\/Atom\/Person\/General\/.+\.(?:vap|json)$/i,
      /Saves\/Person\/.+\.(?:vap|json)$/i,
    ]);

    const resolved = {
      packagePath: normalizedPath,
      name: pickDisplayNameFromVarFile(normalizedPath),
      presetEntry: presetEntry?.entryName || '',
      previewImage: extractVarEntryToCache(zip, previewEntry, cacheDir),
      materials: {
        headDiffuse: extractVarEntryToCache(zip, faceDiffuse, cacheDir),
        headNormal: extractVarEntryToCache(zip, faceNormal, cacheDir),
        bodyDiffuse: extractVarEntryToCache(zip, torsoDiffuse, cacheDir),
        bodyNormal: extractVarEntryToCache(zip, torsoNormal, cacheDir),
        limbsDiffuse: extractVarEntryToCache(zip, limbsDiffuse, cacheDir),
        limbsNormal: extractVarEntryToCache(zip, limbsNormal, cacheDir),
      },
    };
    vamPackageResolutionCache.set(cacheKey, resolved);
    return resolved;
  } catch {
    return null;
  }
}

function normalizeVarPackageOwner(filePath) {
  const stem = path.basename(String(filePath || ''), '.var');
  const parts = stem.split('.').filter(Boolean);
  return parts.length >= 2 ? parts[0] : '';
}

function parseVamAssetEntry(entry, kind) {
  const assetPathMatch = String(entry?.id || '').match(/:(\/Custom\/.+\.(?:vam|vmi))/i);
  const assetPath = assetPathMatch ? assetPathMatch[1].replace(/\//g, '\\') : '';
  const filePath = assetPath ? path.join('D:\\', assetPath.replace(/^\\/, '')) : '';
  const sourceName = normalizeLabel(entry?.internalId || entry?.id || pickDisplayNameFromPath(filePath));
  const displayName = sourceName.includes(':') ? normalizeLabel(sourceName.split(':').pop()) : sourceName;
  const category = kind === 'hair' ? 'capelli' : classifyClothingCategory(`${displayName} ${filePath}`);
  return {
    name: displayName || pickDisplayNameFromPath(filePath),
    source: sourceName,
    path: filePath,
    enabled: String(entry?.enabled || 'true') !== 'false',
    category,
  };
}

function summarizeMorphs(morphs) {
  const summary = {
    total: 0,
    categories: {
      occhi: 0,
      naso: 0,
      bocca: 0,
      pelle: 0,
      seno: 0,
      fisico: 0,
      'mani e posa': 0,
      volto: 0,
      altro: 0,
    },
  };
  for (const morph of toArray(morphs)) {
    const category = classifyMorphCategory(morph?.name || morph?.uid);
    summary.total += 1;
    summary.categories[category] = (summary.categories[category] || 0) + 1;
  }
  return summary;
}

function summarizeMaterials(materials) {
  const first = toArray(materials)[0];
  if (!first || typeof first !== 'object') {
    return { total: 0, skinTone: '', textureHints: [] };
  }
  const hsv = first?.SubsurfaceColor || first?.subsurfaceColor || null;
  const skinTone = hsv && typeof hsv === 'object'
    ? `H ${Number(hsv.h ?? hsv.H ?? 0).toFixed(2)} · S ${Number(hsv.s ?? hsv.S ?? 0).toFixed(2)} · V ${Number(hsv.v ?? hsv.V ?? 0).toFixed(2)}`
    : '';
  const textureHints = Object.entries(first)
    .filter(([key, value]) => /url|texture|diffuse|specular|normal/i.test(key) && value)
    .map(([, value]) => path.basename(String(value)))
    .slice(0, 6);
  return {
    total: toArray(materials).length,
    skinTone,
    textureHints,
  };
}

function buildAppearanceSummary(geometry) {
  const hair = toArray(geometry?.hair).map(entry => parseVamAssetEntry(entry, 'hair'));
  const clothing = toArray(geometry?.clothing).map(entry => parseVamAssetEntry(entry, 'clothing'));
  const clothingCategories = {};
  for (const item of clothing) {
    if (!clothingCategories[item.category]) clothingCategories[item.category] = [];
    clothingCategories[item.category].push(item);
  }
  const morphs = summarizeMorphs(geometry?.morphs);
  const materials = summarizeMaterials(geometry?.materials);
  return {
    hair,
    clothing,
    clothingCategories,
    morphs,
    materials,
    counts: {
      hair: hair.length,
      clothing: clothing.length,
      morphs: morphs.total,
      materialSlots: materials.total,
    },
  };
}

function parseLocalPersonPreset(filePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const pluginCount = raw && typeof raw.plugins === 'object' ? Object.keys(raw.plugins).length : 0;
    return {
      name: pickDisplayNameFromPath(filePath),
      path: filePath,
      presetType: String(raw?.id || path.extname(filePath).slice(1) || 'person-preset'),
      pluginCount,
    };
  } catch {
    return {
      name: pickDisplayNameFromPath(filePath),
      path: filePath,
      presetType: path.extname(filePath).slice(1) || 'person-preset',
      pluginCount: 0,
    };
  }
}

function scanLocalPersonPresetRoots(rootPaths, maxDepth = 4, maxItems = 120) {
  const results = [];
  const queue = rootPaths.filter(rootDir => fs.existsSync(rootDir)).map(rootDir => ({ dirPath: rootDir, depth: 0 }));
  const visited = new Set();

  while (queue.length > 0 && results.length < maxItems) {
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
      const ext = path.extname(entry.name).toLowerCase();
      if (ext !== '.json' && ext !== '.vap') continue;
      results.push(parseLocalPersonPreset(fullPath));
      if (results.length >= maxItems) break;
    }
  }

  return results;
}

function isLikelyCharacterVarPackage(filePath, entryNames, metrics) {
  const name = path.basename(String(filePath || ''), '.var').toLowerCase();
  const hasSavedPreset = entryNames.some(entry => /(?:^|\/)(?:saves\/person|custom\/atom\/person\/[^/]+\/).+\.(?:json|vap)$/i.test(entry));
  if (hasSavedPreset && metrics.textureCount > 0) return true;
  if (/(hair|pose|plugin|morph|texture|muscle|tanline|genital|clothing|outfit|heels|boots|dress|gloves)/.test(name)) {
    return false;
  }
  return metrics.morphCount >= 4 && metrics.textureCount >= 3;
}

function scanVarCharacterPackages(packageRoot, maxItems = 160) {
  if (!fs.existsSync(packageRoot)) {
    return [];
  }

  const files = safeReaddir(packageRoot)
    .filter(entry => !entry.isDirectory() && path.extname(entry.name).toLowerCase() === '.var')
    .map(entry => path.join(packageRoot, entry.name));
  const results = [];

  for (const filePath of files) {
    try {
      const zip = new AdmZip(filePath);
      const entryNames = zip.getEntries().map(entry => entry.entryName);
      const metrics = {
        morphCount: entryNames.filter(entry => /Custom\/Atom\/Person\/Morphs\/.+\.(?:vmb|vmi)$/i.test(entry)).length,
        textureCount: entryNames.filter(entry => /Custom\/Atom\/Person\/Textures\/.+\.(?:png|jpe?g|webp)$/i.test(entry)).length,
        presetCount: entryNames.filter(entry => /(?:^|\/)(?:Saves\/Person|Custom\/Atom\/Person\/[^/]+\/).+\.(?:json|vap)$/i.test(entry)).length,
      };
      if (!isLikelyCharacterVarPackage(filePath, entryNames, metrics)) {
        continue;
      }
      results.push({
        name: pickDisplayNameFromVarFile(filePath),
        packageName: path.basename(filePath),
        packageOwner: normalizeVarPackageOwner(filePath),
        path: filePath,
        morphCount: metrics.morphCount,
        textureCount: metrics.textureCount,
        presetCount: metrics.presetCount,
        category: 'personaggio package',
        previewImage: '',
      });
      if (results.length >= maxItems) break;
    } catch {
      continue;
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

function scanVamAssetRoots(rootPaths, kind, maxDepth = 5, maxItems = 120) {
  const results = [];
  const queue = rootPaths.filter(rootDir => fs.existsSync(rootDir)).map(rootDir => ({ dirPath: rootDir, depth: 0 }));
  const visited = new Set();

  while (queue.length > 0 && results.length < maxItems) {
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
      if (path.extname(entry.name).toLowerCase() !== '.vam') continue;
      const category = kind === 'hair' ? 'capelli' : classifyClothingCategory(`${entry.name} ${fullPath}`);
      results.push({
        name: pickDisplayNameFromPath(fullPath),
        category,
        path: fullPath,
        source: normalizeLabel(path.relative(kind === 'hair' ? 'D:\\Custom\\Hair' : 'D:\\Custom\\Clothing', fullPath)),
      });
      if (results.length >= maxItems) break;
    }
  }

  return results;
}

function buildVamAssetCatalog() {
  if (vamAssetCatalogCache && Date.now() - vamAssetCatalogCache.createdAt < 5 * 60 * 1000) {
    return vamAssetCatalogCache.value;
  }

  const hair = scanVamAssetRoots(VAM_HAIR_ROOTS, 'hair', 5, 120);
  const clothing = scanVamAssetRoots(VAM_CLOTHING_ROOTS, 'clothing', 5, 240);
  const personPresets = scanLocalPersonPresetRoots(VAM_PERSON_PRESET_ROOTS, 4, 80);
  const varCharacters = scanVarCharacterPackages(VAM_PACKAGE_ROOT, 180);
  const clothingByCategory = {};
  for (const item of clothing) {
    if (!clothingByCategory[item.category]) clothingByCategory[item.category] = [];
    clothingByCategory[item.category].push(item);
  }
  const value = {
    counts: {
      hair: hair.length,
      clothing: clothing.length,
      personPresets: personPresets.length,
      varCharacters: varCharacters.length,
    },
    hair: hair.slice(0, 30),
    personPresets: personPresets.slice(0, 24),
    varCharacters: varCharacters.slice(0, 36),
    clothingByCategory: Object.fromEntries(
      Object.entries(clothingByCategory)
        .sort((a, b) => b[1].length - a[1].length)
        .map(([category, items]) => [category, items.slice(0, 18)])
    ),
  };
  vamAssetCatalogCache = {
    createdAt: Date.now(),
    value,
  };
  return value;
}

function findFirstExistingFile(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return '';
}

function buildImageCandidates(dir, stems, extensions = ['.png', '.webp', '.jpg', '.jpeg']) {
  const results = [];
  for (const stem of stems) {
    for (const ext of extensions) {
      results.push(path.join(dir, `${stem}${ext}`));
    }
  }
  return results;
}

function discoverPresetPortraitAssets(dir, baseName) {
  const normalized = String(baseName || '').trim();
  if (!normalized) {
    return {
      previewImage: '',
      baseImage: '',
      blinkImage: '',
      mouthOpenImage: '',
      auraImage: '',
    };
  }

  const previewImage = findFirstExistingFile(buildImageCandidates(dir, [
    normalized,
    `${normalized}_preview`,
    `${normalized}_portrait`,
    `${normalized}_idle`,
    `${normalized}_base`,
  ]));
  const blinkImage = findFirstExistingFile(buildImageCandidates(dir, [
    `${normalized}_blink`,
    `${normalized}_eyes_closed`,
    `${normalized}_closed`,
    `${normalized}_blink1`,
  ]));
  const mouthOpenImage = findFirstExistingFile(buildImageCandidates(dir, [
    `${normalized}_mouth`,
    `${normalized}_mouth_open`,
    `${normalized}_talk`,
    `${normalized}_speak`,
    `${normalized}_openmouth`,
  ]));
  const auraImage = findFirstExistingFile(buildImageCandidates(dir, [
    `${normalized}_aura`,
    `${normalized}_glow`,
    `${normalized}_fx`,
  ]));

  return {
    previewImage,
    baseImage: previewImage,
    blinkImage,
    mouthOpenImage,
    auraImage,
  };
}

function parseVamSceneFile(filePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!raw.atoms || !Array.isArray(raw.atoms)) return null;

    const personAtom = raw.atoms.find(a => a.type === 'Person');
    if (!personAtom) return null;

    let characterName = '';
    let appearance = null;
    if (Array.isArray(personAtom.storables)) {
      const geometry = personAtom.storables.find(s => s.id === 'geometry');
      if (geometry) {
        characterName = geometry.character || '';
        appearance = buildAppearanceSummary(geometry);
      }
    }

    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath, '.json');
    const portraitAssets = discoverPresetPortraitAssets(dir, baseName);

    return {
      name: baseName,
      sceneFile: filePath,
      folderPath: dir,
      previewImage: portraitAssets.previewImage,
      baseImage: portraitAssets.baseImage,
      blinkImage: portraitAssets.blinkImage,
      mouthOpenImage: portraitAssets.mouthOpenImage,
      auraImage: portraitAssets.auraImage,
      characterName,
      appearance,
      personAtomId: personAtom.id || 'Person',
      compatibility: 'vam-scene',
    };
  } catch {
    return null;
  }
}

function extractFullCharacterData(filePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!raw.atoms || !Array.isArray(raw.atoms)) return null;

    const personAtom = raw.atoms.find(a => a.type === 'Person');
    if (!personAtom) return null;

    const storables = Array.isArray(personAtom.storables) ? personAtom.storables : [];
    const geometry = storables.find(s => s.id === 'geometry');
    if (!geometry) return null;

    const characterBase = geometry.character || '';
    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath, '.json');
    const portraitAssets = discoverPresetPortraitAssets(dir, baseName);

    // Clothing — full items with categories
    const clothing = toArray(geometry.clothing).map(entry => {
      const parsed = parseVamAssetEntry(entry, 'clothing');
      return {
        id: String(entry.internalId || entry.id || ''),
        internalId: String(entry.internalId || ''),
        name: parsed.name,
        enabled: parsed.enabled,
        category: parsed.category,
        source: parsed.source,
      };
    });
    const clothingByCategory = {};
    for (const item of clothing) {
      if (!clothingByCategory[item.category]) clothingByCategory[item.category] = [];
      clothingByCategory[item.category].push(item);
    }

    // Hair
    const hair = toArray(geometry.hair).map(entry => {
      const parsed = parseVamAssetEntry(entry, 'hair');
      return {
        id: String(entry.internalId || entry.id || ''),
        internalId: String(entry.internalId || ''),
        name: parsed.name,
        enabled: parsed.enabled,
      };
    });

    // Morphs — full items with categories
    const morphItems = toArray(geometry.morphs).map(morph => {
      const name = String(morph.name || morph.uid || '');
      const value = Number(morph.value ?? 0);
      const category = classifyMorphCategory(name);
      return { name, value, category };
    });
    const morphCategories = {};
    for (const morph of morphItems) {
      if (!morphCategories[morph.category]) morphCategories[morph.category] = [];
      morphCategories[morph.category].push(morph);
    }

    // Skin
    const skinStorable = storables.find(s => s.id === 'skin');
    const skinColorRaw = skinStorable?.['Subsurface Color'] || skinStorable?.SubsurfaceColor || null;
    const skinColor = skinColorRaw && typeof skinColorRaw === 'object'
      ? { h: Number(skinColorRaw.h ?? skinColorRaw.H ?? 0), s: Number(skinColorRaw.s ?? skinColorRaw.S ?? 0), v: Number(skinColorRaw.v ?? skinColorRaw.V ?? 1) }
      : { h: 0, s: 0, v: 1 };

    // Textures
    const textureStorable = storables.find(s => s.id === 'textures');
    const textureRefs = {};
    if (textureStorable) {
      for (const [key, value] of Object.entries(textureStorable)) {
        if (key === 'id') continue;
        textureRefs[key] = String(value || '');
      }
    }

    // Bone controls present (for future gesture mapping)
    const boneControls = storables
      .filter(s => /Control$/.test(s.id || ''))
      .map(s => s.id);

    return {
      name: baseName,
      sceneFile: filePath,
      folderPath: dir,
      characterBase,
      previewImage: portraitAssets.previewImage,
      baseImage: portraitAssets.baseImage,
      blinkImage: portraitAssets.blinkImage,
      mouthOpenImage: portraitAssets.mouthOpenImage,
      auraImage: portraitAssets.auraImage,
      clothing,
      clothingByCategory,
      hair,
      morphs: {
        items: morphItems,
        categories: morphCategories,
        total: morphItems.length,
      },
      skinColor,
      textureRefs,
      boneControls,
      counts: {
        clothing: clothing.length,
        hair: hair.length,
        morphs: morphItems.length,
        bones: boneControls.length,
      },
      personAtomId: personAtom.id || 'Person',
    };
  } catch {
    return null;
  }
}

function getCharacterPresetDir() {
  return ensureDirectory(path.join(app.getPath('userData'), 'gemcode-character-presets'));
}

function listSavedCharacterPresets() {
  const presetDir = getCharacterPresetDir();
  const entries = safeReaddir(presetDir);
  return entries
    .filter(entry => !entry.isDirectory() && path.extname(entry.name).toLowerCase() === '.json')
    .map(entry => {
      const fullPath = path.join(presetDir, entry.name);
      try {
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        return {
          fileName: entry.name,
          filePath: fullPath,
          name: data.name || pickDisplayNameFromPath(fullPath),
          characterBase: data.characterBase || '',
          sourceScene: data.sourceScene || '',
          clothingCount: Array.isArray(data.clothing) ? data.clothing.filter(c => c.enabled).length : 0,
          hairCount: Array.isArray(data.hair) ? data.hair.length : 0,
          morphCount: data.morphOverrides ? Object.keys(data.morphOverrides).length : 0,
          savedAt: data.savedAt || '',
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function saveCharacterPreset(name, presetData) {
  const presetDir = getCharacterPresetDir();
  const fileName = `${slugify(name)}.json`;
  const fullPath = path.join(presetDir, fileName);
  const payload = {
    ...presetData,
    name: String(name || 'Preset').trim(),
    savedAt: new Date().toISOString(),
  };
  fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2), 'utf8');
  return { fileName, filePath: fullPath, name: payload.name };
}

function loadCharacterPreset(fileName) {
  const fullPath = path.join(getCharacterPresetDir(), fileName);
  if (!fs.existsSync(fullPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch {
    return null;
  }
}

function deleteCharacterPreset(fileName) {
  const fullPath = path.join(getCharacterPresetDir(), fileName);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    return true;
  }
  return false;
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

  return results.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 1000);
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

function resolveSceneScanRoots(rootPath) {
  const target = String(rootPath || '').trim();
  if (!target || /^[a-zA-Z]:\\?$/.test(target)) {
    return VAM_SCENE_ROOTS.filter(rootDir => fs.existsSync(rootDir));
  }
  return [target];
}

function resolveVamExecutablePath() {
  const configured = String(store?.vam?.exePath || '').trim();
  if (configured && fs.existsSync(configured)) {
    return configured;
  }

  const candidates = [
    'D:\\VaM\\VaM.exe',
    'D:\\Virt-A-Mate\\VaM.exe',
    'D:\\Games\\VaM\\VaM.exe',
    'C:\\VaM\\VaM.exe',
    'C:\\Virt-A-Mate\\VaM.exe',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return '';
}

function launchVam(sceneFile = '') {
  const exePath = resolveVamExecutablePath();
  if (!exePath) {
    return {
      ok: false,
      launched: false,
      error: 'VaM.exe non trovato. Seleziona il percorso nello Studio.',
    };
  }

  const preferredScene = String(sceneFile || '').trim();
  const resolvedScene = preferredScene && fs.existsSync(preferredScene) ? preferredScene : '';
  const args = resolvedScene ? [resolvedScene] : [];

  try {
    const child = spawn(exePath, args, {
      cwd: path.dirname(exePath),
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    try {
      fs.appendFileSync(DEBUG_LOG, `[MAIN] launchVam exe=${exePath} scene=${resolvedScene || '<none>'}\n`);
    } catch (_) {}
    return {
      ok: true,
      launched: true,
      exePath,
      sceneFile: resolvedScene,
      usedSceneArgument: Boolean(resolvedScene),
    };
  } catch (error) {
    return {
      ok: false,
      launched: false,
      exePath,
      sceneFile: resolvedScene,
      error: error.message || String(error),
    };
  }
}

function updateProfile(profileId, partial) {
  const profileIndex = store.profiles.findIndex(profile => profile.id === profileId);
  if (profileIndex < 0) {
    throw new Error(`Profilo non trovato: ${profileId}`);
  }

  const currentProfile = store.profiles[profileIndex];
  const currentScene = String(currentProfile.characterPreset?.sourceScene || currentProfile.avatar?.sceneFile || '').trim();
  const nextProfile = normalizeProfile(mergeDeep(currentProfile, partial || {}), profileIndex);
  const nextScene = String(nextProfile.characterPreset?.sourceScene || nextProfile.avatar?.sceneFile || '').trim();
  store.profiles.splice(profileIndex, 1, nextProfile);
  if (store.activeProfileId === profileId) {
    syncWidgetWindowToActiveProfile();
  }
  saveSettings();
  applyWidgetSettings();
  broadcastSettings();
  if (store.vam?.autoLaunch && nextScene && nextScene !== currentScene) {
    launchVam(nextScene);
  }
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

ipcMain.handle('companion:pick-vam-exe', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Seleziona VaM.exe',
    defaultPath: resolveVamExecutablePath() || 'D:\\',
    properties: ['openFile'],
    filters: [
      { name: 'VaM executable', extensions: ['exe'] },
      { name: 'Tutti i file', extensions: ['*'] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return '';
  }

  store.vam = {
    ...(store.vam || {}),
    exePath: result.filePaths[0],
  };
  saveSettings();
  broadcastSettings();
  return result.filePaths[0];
});

ipcMain.handle('companion:scan-avatar-library', async (_event, rootPath) => {
  const targetRoot = (rootPath || store.avatarLibraryRoot || 'D:\\Saves\\scene').trim();
  const roots = resolveSceneScanRoots(targetRoot);
  const items = [];
  const seen = new Set();
  for (const rootDir of roots) {
    for (const item of scanVamPresets(rootDir, 4)) {
      if (seen.has(item.sceneFile)) continue;
      seen.add(item.sceneFile);
      items.push(item);
    }
  }
  return {
    rootPath: targetRoot,
    scannedRoots: roots,
    items,
  };
});

ipcMain.handle('companion:list-quick-vam-avatars', async () => ({
  items: getQuickVamPresets(),
}));

ipcMain.handle('companion:get-vam-asset-catalog', async () => buildVamAssetCatalog());

ipcMain.handle('companion:resolve-vam-character-package', async (_event, packagePath) => resolveVarCharacterPackage(packagePath));

ipcMain.handle('companion:launch-vam', async (_event, sceneFile) => launchVam(sceneFile));

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

ipcMain.handle('companion:get-character-data', async (_event, sceneFilePath) => extractFullCharacterData(sceneFilePath));

ipcMain.handle('companion:save-character-preset', async (_event, name, presetData) => {
  const result = saveCharacterPreset(name, presetData);
  return { ...result, presets: listSavedCharacterPresets() };
});

ipcMain.handle('companion:list-character-presets', async () => listSavedCharacterPresets());

ipcMain.handle('companion:load-character-preset', async (_event, fileName) => loadCharacterPreset(fileName));

ipcMain.handle('companion:delete-character-preset', async (_event, fileName) => {
  deleteCharacterPreset(fileName);
  return listSavedCharacterPresets();
});

ipcMain.on('companion:update-widget-live-state', (_event, payload) => {
  routeWidgetState(payload);
});