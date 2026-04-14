import * as THREE from '../node_modules/three/build/three.module.js';
import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from '../node_modules/three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from '../node_modules/three/examples/jsm/loaders/MTLLoader.js';

const root = document.getElementById('widgetRoot');
const avatarStage = document.getElementById('avatarStage');
const modelViewport = document.getElementById('modelViewport');
const avatarBase = document.getElementById('avatarBase');
const avatarBlink = document.getElementById('avatarBlink');
const avatarMouth = document.getElementById('avatarMouth');
const avatarAura = document.getElementById('avatarAura');
const fallbackAvatar = document.getElementById('fallbackAvatar');
const auraLayer = document.getElementById('auraLayer');
const statusChip = document.getElementById('statusChip');
const personaChip = document.getElementById('personaChip');
const transcriptBubble = document.getElementById('transcriptBubble');

const widgetState = {
  settings: null,
  phase: 'idle',
  transcript: '',
  responseText: '',
  modelRuntime: null,
};

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
      if (node.geometry) node.geometry.dispose?.();
      if (node.material) {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach(material => material.dispose?.());
      }
    });
  }
  runtime.model = null;
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
  const maxDimension = Math.max(size.x, size.y, size.z, 1);
  const distance = maxDimension * 1.8;

  runtime.camera.position.set(center.x, center.y + size.y * 0.08, center.z + distance);
  runtime.camera.lookAt(center.x, center.y + size.y * 0.18, center.z);
}

function startRenderLoop() {
  const runtime = widgetState.modelRuntime;
  if (!runtime) return;

  const animate = () => {
    runtime.frameHandle = requestAnimationFrame(animate);
    const delta = runtime.clock.getDelta();
    runtime.mixer?.update(delta);
    if (runtime.model) {
      const elapsed = performance.now() * 0.001;
      const phaseOffset = widgetState.phase === 'listening' ? 0.06 : widgetState.phase === 'speaking' ? 0.08 : 0.03;
      runtime.model.rotation.y = Math.sin(elapsed * 0.42) * phaseOffset;
      runtime.model.position.y = Math.sin(elapsed * 1.25) * (widgetState.phase === 'speaking' ? 0.06 : 0.03);
    }
    runtime.renderer.render(runtime.scene, runtime.camera);
  };

  if (!runtime.frameHandle) animate();
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
    // no-op: obj without material file
  }

  const object = await objLoader.loadAsync(modelUrl);
  runtime.group.add(object);
  runtime.model = object;
  fitCameraToModel(object);
  startRenderLoop();
}

async function loadGltfLikeModel(modelUrl) {
  const runtime = ensureModelRuntime();
  const gltf = await new GLTFLoader().loadAsync(modelUrl);
  const object = gltf.scene || gltf.scenes?.[0];
  if (!object) throw new Error('Modello GLTF/VRM senza scena valida');
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

async function applyModelPath(filePath) {
  const runtime = ensureModelRuntime();
  disposeCurrentModel();
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

function maybeShowTranscript() {
  const showTranscript = widgetState.settings?.widget?.showTranscript !== false;
  if (!showTranscript) {
    transcriptBubble.hidden = true;
    return;
  }
  const text = widgetState.phase === 'speaking' ? widgetState.responseText : widgetState.transcript;
  transcriptBubble.hidden = !text;
  transcriptBubble.textContent = text || '';
}

async function applyAvatarPath(element, filePath) {
  if (!filePath) {
    element.hidden = true;
    element.removeAttribute('src');
    return false;
  }
  const url = await window.gemcodeCompanion.toFileUrl(filePath);
  element.src = url;
  element.hidden = false;
  return true;
}

async function applySettings(settings) {
  const resolved = settings?.activeSettings || settings;
  widgetState.settings = resolved;
  document.documentElement.style.setProperty('--accent', resolved.widget.accentColor || '#6ee7ff');
  root.style.transform = `scale(${resolved.widget.scale || 1})`;
  statusChip.hidden = resolved.widget.showStatus === false;
  personaChip.textContent = resolved.identity?.avatarName || resolved.profileName || 'GemCode';

  const hasBase = await applyAvatarPath(avatarBase, resolved.avatar.baseImage);
  await applyAvatarPath(avatarBlink, resolved.avatar.blinkImage);
  await applyAvatarPath(avatarMouth, resolved.avatar.mouthOpenImage);
  await applyAvatarPath(avatarAura, resolved.avatar.auraImage);
  const hasModel = !hasBase && resolved.avatar.primaryModel ? await applyModelPath(resolved.avatar.primaryModel) : false;
  if (!hasModel) {
    await applyModelPath('');
  }

  fallbackAvatar.hidden = hasBase || hasModel;
  auraLayer.hidden = Boolean(settings.avatar.auraImage);
  maybeShowTranscript();
}

function applyLiveState(payload) {
  widgetState.phase = payload.phase || widgetState.phase;
  widgetState.transcript = payload.transcript || '';
  widgetState.responseText = payload.responseText || '';
  setPhase(widgetState.phase);
  maybeShowTranscript();
}

function scheduleBlink() {
  const nextDelay = 2200 + Math.random() * 3600;
  window.setTimeout(() => {
    root.classList.add('blinking');
    window.setTimeout(() => {
      root.classList.remove('blinking');
      scheduleBlink();
    }, 180);
  }, nextDelay);
}

async function init() {
  const settings = await window.gemcodeCompanion.getSettings();
  await applySettings(settings);
  setPhase('idle');
  scheduleBlink();
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