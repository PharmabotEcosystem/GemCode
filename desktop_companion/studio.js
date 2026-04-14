const state = {
  snapshot: null,
  recording: null,
  avatarLibrary: [],
  quickAvatars: [],
  bridgeHealthTimer: null,
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
    avatarLibraryResults: $('avatarLibraryResults'),
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
    baseImagePath: $('baseImagePath'),
    blinkImagePath: $('blinkImagePath'),
    mouthOpenImagePath: $('mouthOpenImagePath'),
    auraImagePath: $('auraImagePath'),
    primaryModelPath: $('primaryModelPath'),
    sceneFilePath: $('sceneFilePath'),
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

function renderProfileOptions(snapshot) {
  elements.profileSelect.innerHTML = snapshot.profiles
    .map(profile => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}</option>`)
    .join('');
  elements.profileSelect.value = snapshot.activeProfileId;
}

function renderChatLog(messages) {
  const recentMessages = Array.isArray(messages) ? messages : [];
  elements.chatLog.innerHTML = recentMessages.length
    ? recentMessages
        .map(message => `<div class="message ${message.role}">${escapeHtml(message.text)}</div>`)
        .join('')
    : '<div class="empty-state">Nessuna conversazione salvata nel profilo attivo.</div>';
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

  elements.baseImagePath.textContent = profile.avatar.baseImage || 'Default integrato';
  elements.blinkImagePath.textContent = profile.avatar.blinkImage || 'Blink sintetico';
  elements.mouthOpenImagePath.textContent = profile.avatar.mouthOpenImage || 'Lip-sync sintetico';
  elements.auraImagePath.textContent = profile.avatar.auraImage || 'Aura CSS';
  elements.primaryModelPath.textContent = profile.avatar.primaryModel || 'Nessun modello 3D';
  elements.sceneFilePath.textContent = profile.avatar.sceneFile || 'Nessuna scena VAM';

  setSliderBadge(elements.temperature, elements.temperatureValue);
  setSliderBadge(elements.widgetWidth, elements.widgetWidthValue, ' px');
  setSliderBadge(elements.widgetHeight, elements.widgetHeightValue, ' px');
  setSliderBadge(elements.widgetScale, elements.widgetScaleValue, 'x');
  setSliderBadge(elements.widgetOpacity, elements.widgetOpacityValue);

  renderChatLog(profile.memory.recentMessages || []);
}

function renderAvatarLibrary(items, rootPath) {
  state.avatarLibrary = items;
  elements.avatarLibraryRootLabel.textContent = rootPath;
  elements.avatarLibraryCount.textContent = `${items.length} preset rilevati`;

  if (items.length === 0) {
    elements.avatarLibraryResults.innerHTML = '<div class="empty-state">Nessun preset VAM con avatar Person trovato nella cartella scelta.</div>';
    return;
  }

  elements.avatarLibraryResults.innerHTML = items
    .map(
      (item, index) => `
        <article class="library-card">
          <div class="library-preview">
            ${item.previewImage ? `<img src="${encodeURI(`file:///${item.previewImage.replace(/\\/g, '/')}`)}" alt="${escapeHtml(item.name)}" />` : '<div class="empty-state">Nessuna preview</div>'}
          </div>
          <div class="library-body">
            <div class="library-title-row">
              <h3>${escapeHtml(item.name)}</h3>
              <span class="library-badge">${escapeHtml(item.compatibility)}</span>
            </div>
            <div class="library-meta">${item.characterName ? `Personaggio: ${escapeHtml(item.characterName)}` : 'Personaggio non specificato'}</div>
            <div class="library-path">${escapeHtml(item.sceneFile)}</div>
            <div class="library-controls">
              <button class="secondary-button apply-avatar-button" data-index="${index}">Usa preset</button>
            </div>
          </div>
        </article>
      `
    )
    .join('');

  document.querySelectorAll('.apply-avatar-button').forEach(button => {
    button.addEventListener('click', () => {
      const item = state.avatarLibrary[Number(button.dataset.index)];
      if (!item) return;
      void applyAvatarBundle(item);
    });
  });
}

function findCurrentQuickAvatarValue(profile) {
  if (!profile) return '';
  return state.quickAvatars.find(item => {
    return Boolean(profile.avatar.sceneFile) && profile.avatar.sceneFile === item.sceneFile;
  })?.sceneFile || '';
}

function renderQuickAvatarMenu(items) {
  state.quickAvatars = Array.isArray(items) ? items : [];
  if (!state.quickAvatars.length) {
    elements.quickAvatarSelect.innerHTML = '<option value="">Nessun preset VAM disponibile</option>';
    elements.quickAvatarSelect.disabled = true;
    elements.quickAvatarMeta.textContent = 'Nessuna scena VAM con Person trovata.';
    return;
  }

  elements.quickAvatarSelect.disabled = false;
  elements.quickAvatarSelect.innerHTML = state.quickAvatars
    .map(item => `<option value="${escapeHtml(item.sceneFile)}">${escapeHtml(item.name)}${item.characterName ? ` (${escapeHtml(item.characterName)})` : ''}</option>`)
    .join('');

  const profile = activeProfile();
  const currentValue = findCurrentQuickAvatarValue(profile);
  if (currentValue) {
    elements.quickAvatarSelect.value = currentValue;
  }

  const currentItem = state.quickAvatars.find(item => item.sceneFile === elements.quickAvatarSelect.value) || state.quickAvatars[0];
  elements.quickAvatarMeta.textContent = currentItem
    ? `${currentItem.name}${currentItem.characterName ? ` · ${currentItem.characterName}` : ''} · ${currentItem.compatibility}`
    : 'Seleziona un preset avatar.';
}

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
    },
  };
}

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

  const collectedProfile = collectProfileFromForm();
  const currentMessages = [...(profile.memory.recentMessages || [])];
  const userMessage = { role: 'user', text: cleanText, ts: new Date().toISOString() };
  const pendingMessages = [...currentMessages, userMessage].slice(-24);
  renderChatLog(pendingMessages);

  if (!fromVoice) {
    elements.chatInput.value = '';
  }

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
  const payload = await response.json();
  const rawResponse = payload.response_text || payload.error || 'Nessuna risposta';
  const parsed = parseEmotionAndGestures(rawResponse);
  const responseText = parsed.cleanText || rawResponse;
  const nextMessages = [...pendingMessages, { role: 'assistant', text: responseText, ts: new Date().toISOString() }].slice(-24);

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
}

async function assignAvatarFile(kind) {
  const profile = activeProfile();
  if (!profile) return;
  if (!requirePermission(profile.permissions?.fileAccess, 'Accesso file avatar')) return;
  const filePath = await window.gemcodeCompanion.pickAvatarFile(kind);
  if (!filePath) return;
  const snapshot = await window.gemcodeCompanion.updateProfile(profile.id, {
    avatar: {
      ...profile.avatar,
      [kind]: filePath,
    },
  });
  renderSnapshot(snapshot);
}

async function applyAvatarBundle(item) {
  const profile = activeProfile();
  if (!profile) return;
  if (!requirePermission(profile.permissions?.fileAccess, 'Applicazione preset avatar')) return;
  const avatarUpdate = {
    ...profile.avatar,
    name: item.name,
  };
  if (item.sceneFile) {
    avatarUpdate.sceneFile = item.sceneFile;
  }
  if (item.baseImage !== undefined) avatarUpdate.baseImage = item.baseImage;
  if (item.blinkImage !== undefined) avatarUpdate.blinkImage = item.blinkImage;
  if (item.mouthOpenImage !== undefined) avatarUpdate.mouthOpenImage = item.mouthOpenImage;
  if (item.auraImage !== undefined) avatarUpdate.auraImage = item.auraImage;
  if (item.primaryModel !== undefined) avatarUpdate.primaryModel = item.primaryModel;
  const snapshot = await window.gemcodeCompanion.updateProfile(profile.id, {
    name: elements.profileName.value.trim() || profile.name,
    identity: {
      ...profile.identity,
      avatarName: elements.avatarName.value.trim() || item.name,
    },
    avatar: avatarUpdate,
  });
  renderSnapshot(snapshot);
  renderQuickAvatarMenu(state.quickAvatars);
}

async function applyQuickAvatarSelection() {
  const selected = state.quickAvatars.find(item => item.sceneFile === elements.quickAvatarSelect.value);
  if (!selected) return;
  elements.quickAvatarMeta.textContent = `${selected.name}${selected.characterName ? ` · ${selected.characterName}` : ''} · ${selected.compatibility}`;
  await applyAvatarBundle(selected);
  setChatStatus(`Preset applicato: ${selected.name}`);
}

async function scanAvatarLibrary(rootOverride) {
  if (!requirePermission(activeProfile()?.permissions?.fileAccess, 'Scansione libreria avatar')) return;
  elements.avatarLibraryResults.innerHTML = '<div class="empty-state">Scansione in corso...</div>';
  const targetRoot = rootOverride || elements.avatarLibraryRoot.value.trim() || elements.avatarLibraryRootLabel.textContent || 'D:\\';
  const payload = await window.gemcodeCompanion.scanAvatarLibrary(targetRoot);
  renderAvatarLibrary(payload.items || [], payload.rootPath || targetRoot);
}

async function loadQuickAvatarMenu() {
  const payload = await window.gemcodeCompanion.listQuickVamAvatars();
  renderQuickAvatarMenu(payload.items || []);
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

function bindEvents() {
  elements.temperature.addEventListener('input', () => setSliderBadge(elements.temperature, elements.temperatureValue));
  elements.widgetWidth.addEventListener('input', () => setSliderBadge(elements.widgetWidth, elements.widgetWidthValue, ' px'));
  elements.widgetHeight.addEventListener('input', () => setSliderBadge(elements.widgetHeight, elements.widgetHeightValue, ' px'));
  elements.widgetScale.addEventListener('input', () => setSliderBadge(elements.widgetScale, elements.widgetScaleValue, 'x'));
  elements.widgetOpacity.addEventListener('input', () => setSliderBadge(elements.widgetOpacity, elements.widgetOpacityValue));

  elements.focusWidgetButton.addEventListener('click', () => window.gemcodeCompanion.focusWidget());
  elements.saveAppButton.addEventListener('click', () => void saveAppSettings());
  elements.saveProfileButton.addEventListener('click', () => void saveProfile());
  elements.quickAvatarSelect.addEventListener('change', () => {
    void applyQuickAvatarSelection();
  });

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

  document.querySelectorAll('.avatar-picker').forEach(button => {
    button.addEventListener('click', () => {
      void assignAvatarFile(button.dataset.avatarKind);
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

async function init() {
  bindElements();
  bindEvents();
  renderSnapshot(await window.gemcodeCompanion.getSettings());
  await loadQuickAvatarMenu();
  await scanAvatarLibrary(state.snapshot?.app?.avatarLibraryRoot);
  await refreshBridgeHealth();
  state.bridgeHealthTimer = window.setInterval(refreshBridgeHealth, 10000);
  window.gemcodeCompanion.onSettingsUpdated(snapshot => {
    renderSnapshot(snapshot);
    renderQuickAvatarMenu(state.quickAvatars);
  });
}

init().catch(error => {
  console.error(error);
  elements.chatStatus.textContent = `Errore init: ${error.message}`;
});
