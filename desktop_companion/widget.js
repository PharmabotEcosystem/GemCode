import * as THREE from '../node_modules/three/build/three.module.js';
import { FBXLoader } from '../node_modules/three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { MTLLoader } from '../node_modules/three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from '../node_modules/three/examples/jsm/loaders/OBJLoader.js';

const root = document.getElementById('widgetRoot');
const avatarStage = document.getElementById('avatarStage');
const modelViewport = document.getElementById('modelViewport');
const avatarBase = document.getElementById('avatarBase');
const avatarBlink = document.getElementById('avatarBlink');
const avatarMouth = document.getElementById('avatarMouth');
const avatarAura = document.getElementById('avatarAura');
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
const ttsVoiceInput = document.getElementById('ttsVoiceInput');
const autoSpeakCheck = document.getElementById('autoSpeakCheck');
const scaleSlider = document.getElementById('scaleSlider');
const opacitySlider = document.getElementById('opacitySlider');
const alwaysOnTopCheck = document.getElementById('alwaysOnTopCheck');
const showTranscriptCheck = document.getElementById('showTranscriptCheck');
const openStudioBtn = document.getElementById('openStudioBtn');
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
  modelRuntime: null,
  modelError: '',
  applyRevision: 0,
  meshParts: null,
  chatOpen: false,
  avatarPresets: [],
  activeAudio: null,
  settingsSaveTimer: 0,
  activeBubbleRole: 'assistant',
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ==================== JUNO-Style Animation Engine ====================
// Ported from AICompanion.cs — biomechanical motion system for 3D avatar

function _noiseHash(n) {
  n = ((n >> 13) ^ n) | 0;
  n = (n * (n * n * 15731 + 789221) + 1376312589) | 0;
  return (n & 0x7fffffff) / 1073741824.0 - 1.0;
}

function _smoothNoise(x) {
  const xi = Math.floor(x);
  const xf = x - xi;
  const u = xf * xf * (3 - 2 * xf);
  return _noiseHash(xi) * (1 - u) + _noiseHash(xi + 1) * u;
}

function perlinNoise(x, octaves = 3) {
  let val = 0, amp = 1, freq = 1, total = 0;
  for (let i = 0; i < octaves; i++) {
    val += _smoothNoise(x * freq) * amp;
    total += amp;
    amp *= 0.5;
    freq *= 2.17;
  }
  return val / total;
}

function bioEase(t) {
  const c = Math.max(0, Math.min(1, t));
  const ss = c * c * (3 - 2 * c);
  return Math.pow(ss, 1.15);
}

function settleOsc(t, freq, decay) {
  return Math.sin(t * freq * Math.PI * 2) * Math.exp(-t * decay);
}

function lerpV(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

const EMOTION_PARAMS = {
  neutral:   { breathFreq: 0.27, breathAmp: 1.0, swayAmp: 0.03, swaySpd: 0.42, gazeSpd: 1.0, gazeAmp: 1.0 },
  smile:     { breathFreq: 0.30, breathAmp: 1.1, swayAmp: 0.04, swaySpd: 0.48, gazeSpd: 1.2, gazeAmp: 1.1 },
  sad:       { breathFreq: 0.22, breathAmp: 0.8, swayAmp: 0.02, swaySpd: 0.30, gazeSpd: 0.5, gazeAmp: 0.6 },
  angry:     { breathFreq: 0.32, breathAmp: 1.4, swayAmp: 0.015, swaySpd: 0.55, gazeSpd: 1.5, gazeAmp: 0.8 },
  surprised: { breathFreq: 0.28, breathAmp: 1.5, swayAmp: 0.02, swaySpd: 0.40, gazeSpd: 1.8, gazeAmp: 1.3 },
  flirty:    { breathFreq: 0.24, breathAmp: 0.9, swayAmp: 0.05, swaySpd: 0.35, gazeSpd: 0.8, gazeAmp: 0.9 },
};

const GESTURE_DEFS = {
  nod:         { dur: 0.85, atk: 0.30, hld: 0.10, rel: 0.25, stl: 0.20, rx: -0.12, pz: 0.005 },
  shake_head:  { dur: 1.3,  atk: 0.20, hld: 0.05, rel: 0.20, stl: 0.55, ry: 0.14, osc: 2 },
  tilt_head:   { dur: 0.65, atk: 0.35, hld: 0.20, rel: 0.35, stl: 0.10, rz: 0.10 },
  lean_in:     { dur: 1.0,  atk: 0.30, hld: 0.25, rel: 0.35, stl: 0.10, pz: 0.03, rx: -0.04 },
  deep_breath: { dur: 2.2,  atk: 0.25, hld: 0.20, rel: 0.40, stl: 0.15, py: 0.018 },
  look_away:   { dur: 1.1,  atk: 0.25, hld: 0.35, rel: 0.30, stl: 0.10, ry: 0.18, rz: 0.03 },
  shrug:       { dur: 0.9,  atk: 0.20, hld: 0.15, rel: 0.45, stl: 0.20, py: 0.008, rx: 0.03 },
};

const animState = {
  breathPhase: 0,
  ep: { ...EMOTION_PARAMS.neutral },
  emotion: 'neutral',
  blinkTimer: 0,
  nextBlink: 2.5 + Math.random() * 3.0,
  blinkProgress: -1,
  saccadeX: 0, saccadeY: 0, saccadeDecay: 0,
  headLag: 0,
  lipEnv: 0, lipTarget: 0,
  gesture: null,
  gOff: { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0 },
  noiseSeed: Math.random() * 1000,
};

function setEmotion(name) {
  animState.emotion = EMOTION_PARAMS[name] ? name : 'neutral';
}

function triggerGesture(name) {
  const def = GESTURE_DEFS[name];
  if (!def) return;
  animState.gesture = { def, start: performance.now() * 0.001 };
  animState.gOff = { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0 };
}

function setLipSync(active) {
  animState.lipTarget = active ? 1.0 : 0.0;
}

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

function getFileExtension(filePath) {
  const clean = String(filePath || '').toLowerCase();
  const lastDot = clean.lastIndexOf('.');
  return lastDot >= 0 ? clean.slice(lastDot + 1) : '';
}

function buildModelRuntime() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 2000);
  camera.position.set(0, 1.25, 4.4);

  const ambient = new THREE.AmbientLight(0xcdf7ff, 1.25);
  const key = new THREE.DirectionalLight(0xbef8ff, 1.7);
  key.position.set(2.8, 3.2, 5.2);
  const rim = new THREE.DirectionalLight(0x7bb5ff, 1.05);
  rim.position.set(-3.2, 1.8, -2.2);
  scene.add(ambient, key, rim);

  const group = new THREE.Group();
  scene.add(group);

  modelViewport.innerHTML = '';
  modelViewport.appendChild(renderer.domElement);

  return {
    renderer,
    scene,
    camera,
    group,
    mixer: null,
    clock: new THREE.Clock(),
    model: null,
    frameHandle: 0,
  };
}

function resizeModelRuntime() {
  const runtime = widgetState.modelRuntime;
  if (!runtime) return;
  const width = avatarStage.clientWidth || 1;
  const height = avatarStage.clientHeight || 1;
  runtime.camera.aspect = width / height;
  runtime.camera.updateProjectionMatrix();
  runtime.renderer.setSize(width, height, false);
}

function disposeCurrentModel() {
  const runtime = widgetState.modelRuntime;
  if (!runtime) return;

  if (runtime.frameHandle) {
    cancelAnimationFrame(runtime.frameHandle);
    runtime.frameHandle = 0;
  }

  if (runtime.mixer) {
    runtime.mixer.stopAllAction();
    runtime.mixer = null;
  }

  while (runtime.group.children.length > 0) {
    const child = runtime.group.children[0];
    runtime.group.remove(child);
    child.traverse?.(node => {
      node.geometry?.dispose?.();
      if (node.material) {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach(material => material?.dispose?.());
      }
    });
  }

  runtime.model = null;
  widgetState.meshParts = null;
}

function ensureModelRuntime() {
  if (!widgetState.modelRuntime) {
    widgetState.modelRuntime = buildModelRuntime();
    window.addEventListener('resize', resizeModelRuntime);
  }
  resizeModelRuntime();
  return widgetState.modelRuntime;
}

function fitCameraToModel(object) {
  const runtime = widgetState.modelRuntime;
  if (!runtime || !object) return;

  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Bust framing: show head-to-chest (top ~35% of model)
  const bustY = center.y + size.y * 0.28;
  const bustDistance = size.y * 0.48;

  runtime.camera.position.set(center.x, bustY + size.y * 0.02, center.z + bustDistance);
  runtime.camera.lookAt(center.x, bustY, center.z);
}

function indexMeshParts(object) {
  const parts = { body: null, eyes: null, teeth: null, tongue: null, tearLine: null, eyeOcclusion: null, lowerTeeth: null };
  object.traverse(child => {
    const name = (child.name || '').toLowerCase();
    if (name.includes('cc_base_body')) parts.body = child;
    else if (name.includes('cc_base_eye') && !name.includes('occlusion')) parts.eyes = child;
    else if (name.includes('cc_base_teeth')) {
      parts.teeth = child;
      child.traverse(sub => {
        if (sub.isMesh) {
          const matName = (sub.material?.name || sub.name || '').toLowerCase();
          if (matName.includes('lower')) parts.lowerTeeth = sub;
        }
      });
    }
    else if (name.includes('cc_base_tongue')) parts.tongue = child;
    else if (name.includes('cc_base_tearline')) parts.tearLine = child;
    else if (name.includes('cc_base_eyeocclusion')) parts.eyeOcclusion = child;
  });
  return parts;
}

function startRenderLoop() {
  const runtime = widgetState.modelRuntime;
  if (!runtime) return;

  const jawRestY = { value: 0 };
  let jawReady = false;
  if (widgetState.meshParts?.lowerTeeth) {
    jawRestY.value = widgetState.meshParts.lowerTeeth.position.y;
    jawReady = true;
  }

  const animate = () => {
    runtime.frameHandle = requestAnimationFrame(animate);
    const delta = Math.min(runtime.clock.getDelta(), 0.05);
    const t = performance.now() * 0.001;
    runtime.mixer?.update(delta);

    if (!runtime.model) {
      runtime.renderer.render(runtime.scene, runtime.camera);
      return;
    }

    const phase = widgetState.phase;
    const isSpeaking = phase === 'speaking';
    const isListening = phase === 'listening';
    const ep = animState.ep;

    // Emotion parameter lerp (smooth transitions between emotional states)
    const tgt = EMOTION_PARAMS[animState.emotion] || EMOTION_PARAMS.neutral;
    const eL = Math.min(delta * 2.0, 1);
    ep.breathFreq = lerpV(ep.breathFreq, tgt.breathFreq, eL);
    ep.breathAmp = lerpV(ep.breathAmp, tgt.breathAmp, eL);
    ep.swayAmp = lerpV(ep.swayAmp, tgt.swayAmp, eL);
    ep.swaySpd = lerpV(ep.swaySpd, tgt.swaySpd, eL);
    ep.gazeSpd = lerpV(ep.gazeSpd, tgt.gazeSpd, eL);
    ep.gazeAmp = lerpV(ep.gazeAmp, tgt.gazeAmp, eL);

    // Breathing: variable-freq sine + Perlin layers (JUNO biomechanical)
    animState.breathPhase += ep.breathFreq * delta;
    const breathSine = Math.sin(animState.breathPhase * Math.PI * 2);
    const breathNoise = perlinNoise(animState.breathPhase * 0.7 + animState.noiseSeed, 2);
    const breathAmpV = (isSpeaking ? 0.012 : 0.008) * ep.breathAmp;
    const breathY = (breathSine * 0.85 + breathNoise * 0.15) * breathAmpV;

    // Body sway: Perlin-driven (organic, not robotic sine)
    const swaySpd = isSpeaking ? 0.6 : ep.swaySpd;
    const swayAmp = isSpeaking ? 0.06 : isListening ? 0.02 : ep.swayAmp;
    const swayY = perlinNoise(t * swaySpd, 2) * swayAmp;

    // Head inertia coupling (JUNO: head lags body by 0.4 rad equivalent)
    animState.headLag += (swayY - animState.headLag) * delta * 2.5;
    const headInertia = (swayY - animState.headLag) * 0.4;

    // Muscle micro-jitter (JUNO: high-freq Perlin 12-20Hz)
    const jitterY = perlinNoise(t * 15 + animState.noiseSeed, 1) * 0.0008;
    const jitterX = perlinNoise(t * 12 + animState.noiseSeed + 100, 1) * 0.0004;

    // Gesture playback with BioEase phases + settling oscillation
    const gOff = animState.gOff;
    if (animState.gesture) {
      const g = animState.gesture;
      const elapsed = t - g.start;
      const d = g.def;
      const atkEnd = d.atk * d.dur;
      const hldEnd = atkEnd + d.hld * d.dur;
      const relEnd = hldEnd + d.rel * d.dur;

      if (elapsed >= d.dur) {
        animState.gesture = null;
        gOff.px = gOff.py = gOff.pz = gOff.rx = gOff.ry = gOff.rz = 0;
      } else if (d.osc && d.ry) {
        const oscPhase = (elapsed / d.dur) * d.osc * Math.PI * 2;
        const env = elapsed < relEnd ? 1 : Math.exp(-(elapsed - relEnd) * 5);
        gOff.ry = Math.sin(oscPhase) * d.ry * env;
      } else {
        let f = 0;
        if (elapsed < atkEnd) f = bioEase(elapsed / atkEnd);
        else if (elapsed < hldEnd) f = 1.0;
        else if (elapsed < relEnd) f = 1.0 - bioEase((elapsed - hldEnd) / (relEnd - hldEnd));
        else f = settleOsc((elapsed - relEnd) / (d.dur - relEnd), 3.5, 5.0) * 0.15;
        if (d.rx) gOff.rx = d.rx * f;
        if (d.ry) gOff.ry = d.ry * f;
        if (d.rz) gOff.rz = d.rz * f;
        if (d.px) gOff.px = d.px * f;
        if (d.py) gOff.py = d.py * f;
        if (d.pz) gOff.pz = d.pz * f;
      }
    }

    // Apply transforms to model
    runtime.model.rotation.y = swayY + headInertia + gOff.ry;
    runtime.model.rotation.x = (gOff.rx || 0) + jitterX;
    runtime.model.rotation.z = gOff.rz || 0;
    runtime.model.position.y = breathY + jitterY + (gOff.py || 0);
    runtime.model.position.x = gOff.px || 0;
    runtime.model.position.z = (isListening ? 0.01 : 0) + (gOff.pz || 0);

    // Multi-frequency lip sync (JUNO: 8Hz fast + 4Hz mid + 1.5Hz slow + micro-pauses)
    animState.lipEnv += ((isSpeaking ? 1.0 : animState.lipTarget) - animState.lipEnv) * Math.min(delta * 8, 1);
    if (jawReady && widgetState.meshParts?.lowerTeeth) {
      const jaw = widgetState.meshParts.lowerTeeth;
      if (animState.lipEnv > 0.01) {
        const fast = perlinNoise(t * 8.0 + 10, 2) * 0.65;
        const mid = perlinNoise(t * 4.0 + 50, 2) * 0.25;
        const slow = perlinNoise(t * 1.5 + 100, 2) * 0.10;
        const pauseN = perlinNoise(t * 2.3 + 200, 1);
        const microPause = pauseN < -0.3 ? 0 : 1;
        const jawOpen = Math.max(0, (fast + mid + slow) * microPause) * animState.lipEnv * 0.016;
        jaw.position.y += (jawRestY.value - jawOpen - jaw.position.y) * Math.min(delta * 14, 1);
      } else {
        jaw.position.y += (jawRestY.value - jaw.position.y) * Math.min(delta * 10, 1);
      }
    }

    // Eye blink (bio-correct: 2.2-5.5s interval, 70ms close, 110ms open)
    animState.blinkTimer += delta;
    if (animState.blinkProgress < 0) {
      if (animState.blinkTimer >= animState.nextBlink) {
        animState.blinkProgress = 0;
        animState.blinkTimer = 0;
      }
    } else {
      animState.blinkProgress += delta / 0.18;
      if (animState.blinkProgress >= 1.0) {
        animState.blinkProgress = -1;
        animState.nextBlink = 2.2 + Math.random() * 3.3;
        animState.saccadeX = (Math.random() - 0.5) * 0.04;
        animState.saccadeY = (Math.random() - 0.5) * 0.02;
        animState.saccadeDecay = 1.0;
      }
    }
    if (animState.saccadeDecay > 0) {
      animState.saccadeDecay = Math.max(0, animState.saccadeDecay - delta * 8);
    }

    // Eye gaze: Perlin drift + micro-saccade + blink scale
    if (widgetState.meshParts?.eyes) {
      const eyes = widgetState.meshParts.eyes;
      const gazeX = perlinNoise(t * 0.18 * ep.gazeSpd + 300, 2) * 0.02 * ep.gazeAmp;
      const gazeY = perlinNoise(t * 0.13 * ep.gazeSpd + 500, 2) * 0.01 * ep.gazeAmp;
      const sacX = animState.saccadeX * animState.saccadeDecay;
      const sacY = animState.saccadeY * animState.saccadeDecay;
      let eyeScaleY = 1.0;
      if (animState.blinkProgress >= 0 && animState.blinkProgress < 0.39) {
        eyeScaleY = 1.0 - bioEase(animState.blinkProgress / 0.39) * 0.9;
      } else if (animState.blinkProgress >= 0.39) {
        eyeScaleY = 0.1 + bioEase((animState.blinkProgress - 0.39) / 0.61) * 0.9;
      }
      eyes.rotation.y = gazeX + sacX;
      eyes.rotation.x = gazeY + sacY;
      eyes.scale.y = eyeScaleY;
    }

    // Tongue during speech
    if (widgetState.meshParts?.tongue && animState.lipEnv > 0.1) {
      widgetState.meshParts.tongue.position.y = perlinNoise(t * 7 + 400, 1) * 0.003 * animState.lipEnv;
    }

    runtime.renderer.render(runtime.scene, runtime.camera);
  };

  if (!runtime.frameHandle) {
    animate();
  }
}

async function loadObjectModel(modelUrl) {
  const runtime = ensureModelRuntime();
  const objLoader = new OBJLoader();
  const mtlUrl = modelUrl.replace(/\.[^.]+$/, '.mtl');

  try {
    const materials = await new MTLLoader().loadAsync(mtlUrl);
    materials.preload();
    objLoader.setMaterials(materials);
  } catch {
    // OBJ without MTL is still valid.
  }

  const object = await objLoader.loadAsync(modelUrl);
  runtime.group.add(object);
  runtime.model = object;
  widgetState.meshParts = indexMeshParts(object);
  fitCameraToModel(object);
  startRenderLoop();
}

async function loadGltfLikeModel(modelUrl) {
  const runtime = ensureModelRuntime();
  const gltf = await new GLTFLoader().loadAsync(modelUrl);
  const object = gltf.scene || gltf.scenes?.[0];
  if (!object) {
    throw new Error('Modello GLTF/VRM senza scena valida');
  }

  runtime.group.add(object);
  runtime.model = object;
  if (gltf.animations?.length) {
    runtime.mixer = new THREE.AnimationMixer(object);
    gltf.animations.forEach(clip => {
      runtime.mixer.clipAction(clip).play();
    });
  }
  fitCameraToModel(object);
  startRenderLoop();
}

async function loadFbxModel(modelUrl) {
  const runtime = ensureModelRuntime();
  const object = await new FBXLoader().loadAsync(modelUrl);

  runtime.group.add(object);
  runtime.model = object;
  const animations = object.animations || [];
  if (animations.length) {
    runtime.mixer = new THREE.AnimationMixer(object);
    animations.forEach(clip => {
      runtime.mixer.clipAction(clip).play();
    });
  }
  fitCameraToModel(object);
  startRenderLoop();
}

async function applyModelPath(filePath) {
  ensureModelRuntime();
  disposeCurrentModel();
  widgetState.modelError = '';

  if (!filePath) {
    modelViewport.hidden = true;
    root.classList.remove('rendering-model');
    return false;
  }

  const modelUrl = await window.gemcodeCompanion.toFileUrl(filePath);
  const extension = getFileExtension(filePath);
  modelViewport.hidden = false;
  root.classList.add('rendering-model');

  if (extension === 'obj') {
    await loadObjectModel(modelUrl);
    return true;
  }
  if (['glb', 'gltf', 'vrm'].includes(extension)) {
    await loadGltfLikeModel(modelUrl);
    return true;
  }
  if (extension === 'fbx') {
    await loadFbxModel(modelUrl);
    return true;
  }

  modelViewport.hidden = true;
  root.classList.remove('rendering-model');
  return false;
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
  resizeModelRuntime();
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
}

function clearAvatarImages() {
  [avatarBase, avatarBlink, avatarMouth, avatarAura].forEach(element => {
    element.hidden = true;
    element.removeAttribute('src');
  });
}

async function applyAvatarPath(element, filePath) {
  if (!filePath) {
    element.hidden = true;
    element.removeAttribute('src');
    return false;
  }

  const url = await window.gemcodeCompanion.toFileUrl(filePath);
  const separator = url.includes('?') ? '&' : '?';
  const bust = `${separator}rev=${Date.now().toString(36)}`;
  element.src = `${url}${bust}`;
  element.hidden = false;
  return true;
}

async function applySettings(settings) {
  const applyRevision = ++widgetState.applyRevision;
  widgetState.snapshot = settings?.activeProfile ? settings : widgetState.snapshot;
  const resolved = settings?.activeSettings || settings;
  widgetState.settings = resolved;
  widgetState.modelError = '';

  document.documentElement.style.setProperty('--accent', resolved.widget.accentColor || '#6ee7ff');
  root.style.transform = `scale(${resolved.widget.scale || 1})`;
  statusChip.hidden = resolved.widget.showStatus === false;
  personaChip.textContent = resolved.identity?.avatarName || resolved.profileName || 'GemCode';
  ttsVoiceInput.value = resolved.tts?.voice || '';
  autoSpeakCheck.checked = resolved.tts?.autoSpeak !== false;
  scaleSlider.value = String(resolved.widget.scale ?? 1);
  opacitySlider.value = String(resolved.widget.opacity ?? 1);
  alwaysOnTopCheck.checked = resolved.widget.alwaysOnTop !== false;
  showTranscriptCheck.checked = resolved.widget.showTranscript !== false;
  renderChatLog(widgetState.snapshot?.activeProfile?.memory?.recentMessages || []);

  let hasBase = false;
  let hasModel = false;
  const preferModel = Boolean(resolved.avatar.primaryModel);

  try {
    if (preferModel) {
      clearAvatarImages();
      hasModel = await applyModelPath(resolved.avatar.primaryModel);
      if (applyRevision !== widgetState.applyRevision) return;
      if (!hasModel) {
        hasBase = await applyAvatarPath(avatarBase, resolved.avatar.baseImage);
        if (applyRevision !== widgetState.applyRevision) return;
        await applyAvatarPath(avatarBlink, resolved.avatar.blinkImage);
        if (applyRevision !== widgetState.applyRevision) return;
        await applyAvatarPath(avatarMouth, resolved.avatar.mouthOpenImage);
        if (applyRevision !== widgetState.applyRevision) return;
        await applyAvatarPath(avatarAura, resolved.avatar.auraImage);
        if (applyRevision !== widgetState.applyRevision) return;
      }
    } else {
      hasBase = await applyAvatarPath(avatarBase, resolved.avatar.baseImage);
      if (applyRevision !== widgetState.applyRevision) return;
      await applyAvatarPath(avatarBlink, resolved.avatar.blinkImage);
      if (applyRevision !== widgetState.applyRevision) return;
      await applyAvatarPath(avatarMouth, resolved.avatar.mouthOpenImage);
      if (applyRevision !== widgetState.applyRevision) return;
      await applyAvatarPath(avatarAura, resolved.avatar.auraImage);
      if (applyRevision !== widgetState.applyRevision) return;
    }
  } catch (error) {
    if (applyRevision !== widgetState.applyRevision) return;
    widgetState.modelError = error instanceof Error ? error.message : String(error || 'Errore modello 3D');
    root.classList.remove('rendering-model');
    modelViewport.hidden = true;
  }

  if (!hasModel) {
    await applyModelPath('');
    if (applyRevision !== widgetState.applyRevision) return;
  }

  fallbackAvatar.hidden = hasBase || hasModel;
  auraLayer.hidden = Boolean(resolved.avatar.auraImage) || hasModel;
  if (widgetState.modelError) {
    statusChip.hidden = false;
    statusChip.textContent = `MODEL ERROR: ${widgetState.modelError}`;
  }
  maybeShowTranscript();
}

function applyLiveState(payload) {
  widgetState.phase = payload.phase || widgetState.phase;
  widgetState.transcript = payload.transcript || '';
  widgetState.responseText = payload.responseText || '';
  setPhase(widgetState.phase);
  maybeShowTranscript();
  if (payload.emotion) setEmotion(payload.emotion);
  if (payload.gesture) triggerGesture(payload.gesture);
  if (payload.lipSync !== undefined) setLipSync(payload.lipSync);
}

async function persistRecentMessages(messages) {
  await updateProfilePartial({
    memory: {
      ...(getActiveProfile()?.memory || {}),
      recentMessages: messages.slice(-24),
    },
  });
}

async function sendChat(text) {
  const profile = getRuntimeProfile();
  if (!profile) return;
  const cleanText = String(text || chatInput.value || '').trim();
  if (!cleanText) return;

  const currentMessages = [...(getActiveProfile()?.memory?.recentMessages || [])];
  const userMessage = { role: 'user', text: cleanText, ts: new Date().toISOString() };
  const pendingMessages = [...currentMessages, userMessage].slice(-24);
  renderChatLog(pendingMessages);
  chatInput.value = '';

  renderSpeechBubble(cleanText, 'user');
  setPhase('thinking');
  window.gemcodeCompanion.updateWidgetLiveState({ phase: 'thinking', transcript: cleanText, responseText: '' });

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
  const payload = await response.json();
  const rawResponse = payload.response_text || payload.error || 'Nessuna risposta';
  const parsed = parseEmotionAndGestures(rawResponse);
  const responseText = parsed.cleanText || rawResponse;
  const nextMessages = [...pendingMessages, { role: 'assistant', text: responseText, ts: new Date().toISOString() }].slice(-24);
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
    const audio = new Audio(payload.audio_url);
    widgetState.activeAudio = audio;
    audio.addEventListener('ended', () => {
      widgetState.activeAudio = null;
      window.gemcodeCompanion.updateWidgetLiveState({ phase: 'idle', transcript: cleanText, responseText, lipSync: false });
    });
    audio.play().catch(() => {
      widgetState.activeAudio = null;
      window.gemcodeCompanion.updateWidgetLiveState({ phase: 'idle', transcript: cleanText, responseText, lipSync: false });
    });
  }
}

async function init() {
  const settings = await window.gemcodeCompanion.getSettings();
  await applySettings(settings);
  await loadAvatarPresets();
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
  micButton.addEventListener('click', () => {
    renderSpeechBubble('Il microfono dal widget non e ancora collegato. Per ora usa la chat testuale o apri lo Studio.', 'assistant');
  });
  quickAvatarSelect.addEventListener('change', async () => {
    const preset = widgetState.avatarPresets.find(item => item.sceneFile === quickAvatarSelect.value);
    if (!preset) return;
    await updateProfilePartial({
      identity: {
        ...getActiveProfile()?.identity,
        avatarName: preset.name,
      },
      avatar: {
        ...getActiveProfile()?.avatar,
        name: preset.name,
        sceneFile: preset.sceneFile,
      },
    });
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
  alwaysOnTopCheck.addEventListener('change', () => {
    scheduleSettingsSave(profile => ({ widget: { ...profile.widget, alwaysOnTop: alwaysOnTopCheck.checked } }));
  });
  showTranscriptCheck.addEventListener('change', () => {
    maybeShowTranscript();
    scheduleSettingsSave(profile => ({ widget: { ...profile.widget, showTranscript: showTranscriptCheck.checked } }));
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

init().catch(error => {
  setPhase('error');
  statusChip.textContent = `ERROR: ${error.message}`;
});