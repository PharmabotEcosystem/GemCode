import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Plus,
  Send,
  Settings,
  ChevronLeft,
  ChevronRight,
  Trash2,
  X,
  MessageSquare,
  Cpu,
  Thermometer,
  FileText,
  Info,
  Copy,
  Check,
  Server,
  Wifi,
  WifiOff,
  AlertCircle,
  Radio,
  RefreshCw,
  Mic,
  SlidersHorizontal,
  Save,
  Boxes,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  isStreaming?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  timestamp: Date;
}

type Reachability = 'online' | 'offline' | 'checking';

interface AppSettings {
  ollamaHost: string;
  ollamaModel: string;
  temperature: number;
  systemPrompt: string;
  bridgeUrl: string;
  voiceDeviceId: string;
}

interface VoiceBridgeSettings {
  agent_url: string;
  model: string;
  system_prompt: string;
  temperature: number;
  max_response_sentences: number;
  max_response_chars: number;
  tts_voice: string;
  device_id: string;
  device_name: string;
  device_mode: string;
  wake_word_label: string;
  wake_word_model: string;
  wake_word_notes: string;
}

interface VoiceDeviceStatus {
  device_id: string;
  device_name: string;
  remote_ip: string;
  firmware_mode: string;
  wake_word_label: string;
  wake_word_model: string;
  status: 'online' | 'offline' | 'unknown';
  last_seen_iso: string;
  voice_session_status: string;
  last_transcript: string;
  last_response_text: string;
  audio_url: string;
  error: string;
}

interface BridgeLogEntry {
  timestamp: string;
  level: string;
  message: string;
}

interface BridgeHealthSnapshot {
  status: string;
  public_host: string;
  bridge_settings_file: string;
  ports: {
    wyoming: number;
    http: number;
    udp_audio: number;
    udp_control: number;
  };
  device_count: number;
  active_sessions: number;
  error_sessions: number;
  latest_audio_url: string;
  latest_audio_device_id: string;
  latest_error: string;
  latest_transcript: string;
  latest_response_text: string;
  latest_seen_iso: string;
  recent_logs: BridgeLogEntry[];
  devices: VoiceDeviceStatus[];
}

interface ModelOption {
  name: string;
  family?: string;
  parameterSize?: string;
  quantization?: string;
}

const STORAGE_KEY = 'gemcode-web-settings-v2';

const DEFAULT_SETTINGS: AppSettings = {
  ollamaHost: 'http://localhost:8080',
  ollamaModel: 'gemma4',
  temperature: 0.7,
  systemPrompt:
    'Sei GemCode Assistant, un assistente AI utile, preciso e conciso. ' +
    'Rispondi sempre in modo chiaro e diretto. ' +
    'Se non conosci qualcosa, dillo esplicitamente senza inventare.',
  bridgeUrl: 'http://localhost:10301',
  voiceDeviceId: 'box3',
};

const DEFAULT_VOICE_BRIDGE_SETTINGS: VoiceBridgeSettings = {
  agent_url: 'http://localhost:11434/api/chat',
  model: 'gemma4',
  system_prompt:
    'Rispondi sempre in italiano colloquiale come assistente vocale locale di GemCode. ' +
    'Mantieni la risposta molto breve: massimo due frasi corte. ' +
    'Non usare markdown, elenchi, titoli, citazioni o spiegazioni metalinguistiche. ' +
    'Se l\'input e confuso, offensivo o sembra rumore, chiedi semplicemente di ripetere.',
  temperature: 0.2,
  max_response_sentences: 2,
  max_response_chars: 220,
  tts_voice: 'it-IT-ElsaNeural',
  device_id: 'box3',
  device_name: 'Home Assistant Voice PE',
  device_mode: 'ptt',
  wake_word_label: 'GEMMA',
  wake_word_model: 'placeholder - serve un modello GEMMA dedicato',
  wake_word_notes: 'Per una vera wake word GEMMA serve un modello micro_wake_word dedicato.',
};

const SUGGESTION_CHIPS = [
  'Spiega come funziona un Transformer',
  'Scrivi un\'API REST in Kotlin con Ktor',
  'Cos\'e il pattern ReAct negli agenti AI?',
  'Crea uno script Python per analizzare un CSV',
];

function loadStoredSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function* ollamaStream(
  host: string,
  model: string,
  messages: { role: string; content: string }[],
  temperature: number,
  signal: AbortSignal
): AsyncGenerator<string> {
  const url = `${host.replace(/\/$/, '')}/api/chat`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true, options: { temperature } }),
      signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Impossibile raggiungere Ollama su ${host}. ` +
        'Assicurati che Ollama sia in esecuzione (`ollama serve`) e ' +
        `che il modello "${model}" sia scaricato (\`ollama pull ${model}\`). Dettaglio: ${msg}`
    );
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Ollama HTTP ${resp.status}: ${body}`);
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        const token: string = json?.message?.content ?? '';
        if (token) yield token;
        if (json.done) return;
      } catch {
        // Ignora linee malformate.
      }
    }
  }
}

async function checkOllamaStatus(host: string): Promise<'online' | 'offline'> {
  try {
    const resp = await fetch(`${host.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return resp.ok ? 'online' : 'offline';
  } catch {
    return 'offline';
  }
}

async function checkBridgeStatus(bridgeUrl: string): Promise<Reachability> {
  try {
    const resp = await fetch(`${bridgeUrl.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(2000) });
    return resp.ok ? 'online' : 'offline';
  } catch {
    return 'offline';
  }
}

async function fetchBridgeSettings(bridgeUrl: string): Promise<VoiceBridgeSettings> {
  const resp = await fetch(`${bridgeUrl.replace(/\/$/, '')}/api/settings`, { signal: AbortSignal.timeout(4000) });
  if (!resp.ok) throw new Error(`Bridge HTTP ${resp.status}`);
  return { ...DEFAULT_VOICE_BRIDGE_SETTINGS, ...(await resp.json()) };
}

async function saveBridgeSettings(bridgeUrl: string, config: VoiceBridgeSettings): Promise<VoiceBridgeSettings> {
  const resp = await fetch(`${bridgeUrl.replace(/\/$/, '')}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
    signal: AbortSignal.timeout(5000),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Salvataggio bridge fallito (${resp.status}): ${body}`);
  }
  return { ...DEFAULT_VOICE_BRIDGE_SETTINGS, ...(await resp.json()) };
}

async function fetchVoiceDeviceStatus(bridgeUrl: string, deviceId: string): Promise<VoiceDeviceStatus | null> {
  const resp = await fetch(
    `${bridgeUrl.replace(/\/$/, '')}/api/device/status?device_id=${encodeURIComponent(deviceId)}`,
    { signal: AbortSignal.timeout(4000) }
  );
  if (!resp.ok) return null;
  return await resp.json();
}

async function fetchBridgeHealth(bridgeUrl: string): Promise<BridgeHealthSnapshot> {
  const resp = await fetch(`${bridgeUrl.replace(/\/$/, '')}/api/bridge/health`, {
    signal: AbortSignal.timeout(4000),
  });
  if (!resp.ok) throw new Error(`Bridge health HTTP ${resp.status}`);
  return await resp.json();
}

async function fetchModelOptions(baseUrl: string): Promise<ModelOption[]> {
  const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
    signal: AbortSignal.timeout(4000),
  });
  if (!resp.ok) throw new Error(`Model tags HTTP ${resp.status}`);
  const data = await resp.json();
  const models = Array.isArray(data?.models) ? data.models : [];
  return models
    .map((model: any) => ({
      name: String(model?.name ?? model?.model ?? ''),
      family: model?.details?.family ? String(model.details.family) : undefined,
      parameterSize: model?.details?.parameter_size ? String(model.details.parameter_size) : undefined,
      quantization: model?.details?.quantization_level ? String(model.details.quantization_level) : undefined,
    }))
    .filter((model: ModelOption) => model.name);
}

function toChatEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/api/chat`;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [voiceBridgeStatus, setVoiceBridgeStatus] = useState<Reachability>('checking');
  const [voiceBridgeSettings, setVoiceBridgeSettings] = useState<VoiceBridgeSettings>(DEFAULT_VOICE_BRIDGE_SETTINGS);
  const [voiceDeviceStatus, setVoiceDeviceStatus] = useState<VoiceDeviceStatus | null>(null);
  const [bridgeHealth, setBridgeHealth] = useState<BridgeHealthSnapshot | null>(null);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [voiceSettingsDirty, setVoiceSettingsDirty] = useState(false);
  const [voiceSettingsMessage, setVoiceSettingsMessage] = useState<string | null>(null);
  const [isSavingVoiceSettings, setIsSavingVoiceSettings] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSettings(loadStoredSettings());
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    setOllamaStatus('checking');
    checkOllamaStatus(settings.ollamaHost).then(setOllamaStatus);
  }, [settings.ollamaHost]);

  useEffect(() => {
    let cancelled = false;

    async function refreshModels() {
      try {
        const models = await fetchModelOptions(settings.ollamaHost);
        if (!cancelled) setModelOptions(models);
      } catch {
        if (!cancelled) setModelOptions([]);
      }
    }

    refreshModels();
    return () => {
      cancelled = true;
    };
  }, [settings.ollamaHost]);

  useEffect(() => {
    let cancelled = false;

    async function refreshBridgeData() {
      const bridgeState = await checkBridgeStatus(settings.bridgeUrl);
      if (cancelled) return;
      setVoiceBridgeStatus(bridgeState);

      if (bridgeState !== 'online') {
        setVoiceDeviceStatus(null);
        setBridgeHealth(null);
        return;
      }

      try {
        const [bridgeConfig, deviceStatus, health] = await Promise.all([
          fetchBridgeSettings(settings.bridgeUrl),
          fetchVoiceDeviceStatus(settings.bridgeUrl, settings.voiceDeviceId),
          fetchBridgeHealth(settings.bridgeUrl),
        ]);

        if (cancelled) return;
        if (!voiceSettingsDirty) setVoiceBridgeSettings(bridgeConfig);
        setVoiceDeviceStatus(deviceStatus);
        setBridgeHealth(health);
      } catch {
        if (!cancelled) {
          setVoiceBridgeStatus('offline');
          setBridgeHealth(null);
        }
      }
    }

    refreshBridgeData();
    const intervalId = window.setInterval(refreshBridgeData, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [settings.bridgeUrl, settings.voiceDeviceId, voiceSettingsDirty]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

  const updateVoiceBridgeSettings = <K extends keyof VoiceBridgeSettings>(key: K, value: VoiceBridgeSettings[K]) => {
    setVoiceBridgeSettings(prev => ({ ...prev, [key]: value }));
    setVoiceSettingsDirty(true);
    setVoiceSettingsMessage(null);
  };

  const reloadVoiceBridgeSettings = useCallback(async () => {
    setVoiceSettingsMessage(null);
    try {
      const [bridgeConfig, deviceStatus, health] = await Promise.all([
        fetchBridgeSettings(settings.bridgeUrl),
        fetchVoiceDeviceStatus(settings.bridgeUrl, settings.voiceDeviceId),
        fetchBridgeHealth(settings.bridgeUrl),
      ]);
      setVoiceBridgeSettings(bridgeConfig);
      setVoiceDeviceStatus(deviceStatus);
      setBridgeHealth(health);
      setVoiceSettingsDirty(false);
      setVoiceSettingsMessage('Impostazioni ricaricate dal bridge');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setVoiceSettingsMessage(`Ricarica fallita: ${msg}`);
    }
  }, [settings.bridgeUrl, settings.voiceDeviceId]);

  const saveUnifiedPortalConfig = useCallback(async () => {
    setIsSavingVoiceSettings(true);
    setVoiceSettingsMessage(null);
    try {
      const updated = await saveBridgeSettings(settings.bridgeUrl, {
        ...voiceBridgeSettings,
        agent_url: toChatEndpoint(settings.ollamaHost),
        model: settings.ollamaModel,
        system_prompt: settings.systemPrompt,
        temperature: settings.temperature,
        device_id: settings.voiceDeviceId,
      });
      setVoiceBridgeSettings(updated);
      setVoiceSettingsDirty(false);
      setVoiceSettingsMessage('Profilo condiviso sincronizzato su portale e bridge');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setVoiceSettingsMessage(`Sincronizzazione fallita: ${msg}`);
    } finally {
      setIsSavingVoiceSettings(false);
    }
  }, [settings, voiceBridgeSettings]);

  const saveVoiceBridgeConfig = useCallback(async () => {
    setIsSavingVoiceSettings(true);
    setVoiceSettingsMessage(null);
    try {
      const updated = await saveBridgeSettings(settings.bridgeUrl, voiceBridgeSettings);
      setVoiceBridgeSettings(updated);
      setSettings(prev => ({ ...prev, voiceDeviceId: updated.device_id }));
      setVoiceSettingsDirty(false);
      setVoiceSettingsMessage('Impostazioni bridge salvate');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setVoiceSettingsMessage(`Salvataggio fallito: ${msg}`);
    } finally {
      setIsSavingVoiceSettings(false);
    }
  }, [settings.bridgeUrl, voiceBridgeSettings]);

  const newChat = useCallback(() => {
    if (messages.length > 0) {
      setConversations(prev => [
        { id: Date.now().toString(), title: messages[0].text.slice(0, 45), timestamp: new Date() },
        ...prev.slice(0, 19),
      ]);
    }
    setMessages([]);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setError(null);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', text: trimmed };
    const modelId = `m-${Date.now()}`;
    const modelMsg: Message = { id: modelId, role: 'model', text: '', isStreaming: true };

    setMessages(prev => [...prev, userMsg, modelMsg]);
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const history = [...messages, userMsg].map(m => ({
        role: m.role === 'model' ? 'assistant' : 'user',
        content: m.text,
      }));

      let gen: AsyncGenerator<string>;

      gen = ollamaStream(
        settings.ollamaHost,
        settings.ollamaModel,
        [{ role: 'system', content: settings.systemPrompt }, ...history],
        settings.temperature,
        controller.signal
      );

      let accumulated = '';
      for await (const token of gen) {
        if (controller.signal.aborted) break;
        accumulated += token;
        setMessages(prev => prev.map(m => (m.id === modelId ? { ...m, text: accumulated } : m)));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages(prev => prev.filter(m => m.id !== modelId));
      setError(msg);
    } finally {
      setIsLoading(false);
      setMessages(prev => prev.map(m => (m.id === modelId ? { ...m, isStreaming: false } : m)));
      abortRef.current = null;
    }
  }, [isLoading, messages, settings]);

  const stopGeneration = () => {
    abortRef.current?.abort();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const activeBackendLabel = `${settings.ollamaModel} · Profilo condiviso`;

  return (
    <div className="flex h-screen bg-base text-primary overflow-hidden">
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            key="sidebar"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col bg-surface border-r border-border overflow-hidden shrink-0"
          >
            <div className="flex items-center gap-3 px-4 py-5 border-b border-border">
              <GemcodeLogo />
              <span className="font-semibold text-primary text-base tracking-tight">GemCode</span>
            </div>

            <div className="px-3 py-3">
              <button
                onClick={newChat}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-secondary hover:bg-elevated hover:text-primary transition-colors"
              >
                <Plus className="w-4 h-4 shrink-0" />
                Nuova chat
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
              {conversations.length > 0 && (
                <p className="px-3 py-2 text-xs font-medium text-muted uppercase tracking-wider">Recenti</p>
              )}
              {conversations.map(conv => (
                <div
                  key={conv.id}
                  className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm text-secondary hover:bg-elevated/60 hover:text-primary cursor-default transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted" />
                  <span className="truncate leading-snug">{conv.title}</span>
                </div>
              ))}
              {conversations.length === 0 && (
                <p className="px-3 py-4 text-xs text-muted text-center">Le conversazioni appariranno qui</p>
              )}
            </div>

            <div className="border-t border-border px-3 py-3 space-y-1.5">
              <div className="px-3 py-2 flex items-center gap-2 text-xs text-muted">
                <BackendStatusDot ollamaStatus={ollamaStatus} />
                <span className="truncate">{activeBackendLabel}</span>
              </div>
              <div className="px-3 py-2 flex items-center gap-2 text-xs text-muted">
                {voiceDeviceStatus?.status === 'online' ? (
                  <Wifi className="w-3.5 h-3.5 text-green-400 shrink-0" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5 text-red-400 shrink-0" />
                )}
                <span className="truncate">
                  {voiceDeviceStatus?.device_name ?? settings.voiceDeviceId} · {voiceDeviceStatus?.status ?? 'sconosciuto'}
                </span>
              </div>
              <button
                onClick={() => setSettingsOpen(true)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-secondary hover:bg-elevated hover:text-primary transition-colors"
              >
                <Settings className="w-4 h-4 shrink-0" />
                Impostazioni
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface/80 backdrop-blur shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(v => !v)}
              className="p-2 rounded-lg text-secondary hover:bg-elevated hover:text-primary transition-colors"
            >
              {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {!sidebarOpen && <GemcodeLogo />}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-elevated border border-border text-xs font-medium text-secondary hover:text-primary hover:border-accent/50 transition-colors"
            >
              <BackendStatusDot ollamaStatus={ollamaStatus} />
              {activeBackendLabel}
            </button>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-elevated border border-border text-xs font-medium text-secondary">
              {voiceDeviceStatus?.status === 'online' ? (
                <Wifi className="w-3.5 h-3.5 text-green-400" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-red-400" />
              )}
              <span>{voiceDeviceStatus?.status === 'online' ? 'Dispositivo attivo' : 'Dispositivo offline'}</span>
            </div>
            {messages.length > 0 && (
              <button
                onClick={newChat}
                className="p-2 rounded-lg text-secondary hover:bg-elevated hover:text-primary transition-colors"
                title="Nuova chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <WelcomeScreen onSuggestion={sendMessage} />
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
              {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
              {error && <ErrorBanner message={error} />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {error && messages.length === 0 && (
          <div className="max-w-3xl mx-auto w-full px-4 pb-2">
            <ErrorBanner message={error} />
          </div>
        )}

        <div className="shrink-0 px-4 pb-6 pt-2">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex items-end gap-3 bg-elevated border border-border rounded-2xl px-4 py-3 focus-within:border-accent/50 transition-colors shadow-sm">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Scrivi un messaggio..."
                rows={1}
                className="flex-1 bg-transparent resize-none text-sm text-primary placeholder:text-muted focus:outline-none leading-relaxed max-h-48"
                disabled={isLoading}
              />
              <div className="flex items-center shrink-0 pb-0.5">
                {isLoading ? (
                  <button
                    onClick={stopGeneration}
                    className="p-2 rounded-xl bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                    title="Interrompi"
                  >
                    <div className="w-3.5 h-3.5 rounded-sm bg-accent" />
                  </button>
                ) : (
                  <button
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim()}
                    className="p-2 rounded-xl bg-accent text-white hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title="Invia (Enter)"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-center text-xs text-muted mt-2">
              GemCode · {activeBackendLabel} · Bridge voce {voiceBridgeStatus} · Dispositivo {voiceDeviceStatus?.status ?? 'unknown'}
            </p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {settingsOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setSettingsOpen(false)}
            />
            <motion.div
              key="panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-[28rem] bg-surface border-l border-border z-50 flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="font-semibold text-primary">Impostazioni GemCode</h2>
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="p-1.5 rounded-lg text-secondary hover:bg-elevated hover:text-primary transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
                <SettingsSection icon={<Cpu className="w-4 h-4" />} title="Profilo LLM condiviso">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-xl border border-border bg-elevated/40 px-3 py-3 text-sm">
                      <div>
                        <p className="text-primary font-medium">Backend unico del portale</p>
                        <p className="text-xs text-muted">La chat web e i dispositivi voce usano lo stesso profilo</p>
                      </div>
                      <StatusBadge status={ollamaStatus === 'online' ? 'ok' : ollamaStatus === 'offline' ? 'error' : 'checking'} label={ollamaStatus === 'online' ? 'online' : ollamaStatus === 'offline' ? 'offline' : 'checking'} />
                    </div>
                    <TextField
                      label="Host LLM condiviso"
                      value={settings.ollamaHost}
                      onChange={value => setSettings(s => ({ ...s, ollamaHost: value }))}
                      placeholder="http://localhost:8080"
                    />
                    <div>
                      <label className="text-xs text-muted mb-1.5 block">Modello condiviso</label>
                      <select
                        value={settings.ollamaModel}
                        onChange={e => setSettings(s => ({ ...s, ollamaModel: e.target.value }))}
                        className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-primary focus:border-accent/50 focus:outline-none transition-colors"
                      >
                        {modelOptions.length === 0 ? (
                          <option value={settings.ollamaModel}>{settings.ollamaModel}</option>
                        ) : (
                          modelOptions.map(model => (
                            <option key={model.name} value={model.name}>
                              {model.name}
                            </option>
                          ))
                        )}
                      </select>
                      {modelOptions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {modelOptions.map(model => (
                            <span key={model.name} className="rounded-full border border-border px-2 py-1 text-[11px] text-secondary">
                              {model.name}
                              {model.family ? ` · ${model.family}` : ''}
                              {model.parameterSize ? ` · ${model.parameterSize}` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <RangeField
                      label="Temperatura condivisa"
                      min={0}
                      max={1}
                      step={0.05}
                      value={settings.temperature}
                      onChange={value => setSettings(s => ({ ...s, temperature: value }))}
                    />
                    <div>
                      <label className="text-xs text-muted mb-1.5 block">System prompt condiviso</label>
                      <textarea
                        value={settings.systemPrompt}
                        onChange={e => setSettings(s => ({ ...s, systemPrompt: e.target.value }))}
                        rows={6}
                        className="w-full bg-elevated border border-border rounded-xl px-3 py-2.5 text-xs text-secondary focus:text-primary focus:border-accent/50 focus:outline-none resize-none leading-relaxed transition-colors"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={reloadVoiceBridgeSettings}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-border text-sm text-secondary hover:bg-elevated hover:text-primary transition-colors"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Ricarica stato
                      </button>
                      <button
                        onClick={saveUnifiedPortalConfig}
                        disabled={isSavingVoiceSettings || voiceBridgeStatus !== 'online'}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-accent text-white disabled:opacity-40 transition-colors"
                      >
                        <Save className="w-4 h-4" />
                        {isSavingVoiceSettings ? 'Sincronizzo...' : 'Applica a tutti'}
                      </button>
                    </div>
                    {voiceSettingsMessage && (
                      <div className="rounded-xl bg-accent/10 border border-accent/20 px-3 py-2 text-xs text-accent">
                        {voiceSettingsMessage}
                      </div>
                    )}
                  </div>
                </SettingsSection>

                <SettingsSection icon={<Boxes className="w-4 h-4" />} title="Dispositivi collegati">
                  <DeviceFleetCard
                    devices={bridgeHealth?.devices ?? []}
                    selectedDeviceId={settings.voiceDeviceId}
                    onSelect={deviceId => setSettings(s => ({ ...s, voiceDeviceId: deviceId }))}
                  />
                </SettingsSection>

                <SettingsSection icon={<Radio className="w-4 h-4" />} title="Bridge voce GemCode">
                  <div className="space-y-3">
                    <TextField
                      label="URL bridge"
                      value={settings.bridgeUrl}
                      onChange={value => setSettings(s => ({ ...s, bridgeUrl: value }))}
                      placeholder="http://localhost:10301"
                    />
                    <div className="flex items-center justify-between rounded-xl border border-border bg-elevated/40 px-3 py-3 text-sm">
                      <div>
                        <p className="text-primary font-medium">Stato bridge</p>
                        <p className="text-xs text-muted">HTTP {settings.bridgeUrl}</p>
                      </div>
                      <StatusBadge status={voiceBridgeStatus === 'online' ? 'ok' : voiceBridgeStatus === 'offline' ? 'error' : 'checking'} label={voiceBridgeStatus} />
                    </div>
                    <InfoRow label="Device selezionato" value={settings.voiceDeviceId} />
                  </div>
                </SettingsSection>

                <SettingsSection icon={<Mic className="w-4 h-4" />} title="Dispositivo voce">
                  <DeviceStatusCard status={voiceDeviceStatus} />
                </SettingsSection>

                <SettingsSection icon={<RefreshCw className="w-4 h-4" />} title="Health e live logs">
                  <BridgeHealthCard snapshot={bridgeHealth} />
                </SettingsSection>

                <SettingsSection icon={<SlidersHorizontal className="w-4 h-4" />} title="Parametri voce specifici">
                  <div className="space-y-3">
                    <NumberField
                      label="Frasi massime risposta"
                      value={voiceBridgeSettings.max_response_sentences}
                      onChange={value => updateVoiceBridgeSettings('max_response_sentences', value)}
                      min={1}
                      max={4}
                    />
                    <NumberField
                      label="Caratteri massimi risposta"
                      value={voiceBridgeSettings.max_response_chars}
                      onChange={value => updateVoiceBridgeSettings('max_response_chars', value)}
                      min={80}
                      max={500}
                    />
                    <TextField
                      label="Voce TTS"
                      value={voiceBridgeSettings.tts_voice}
                      onChange={value => updateVoiceBridgeSettings('tts_voice', value)}
                      placeholder="it-IT-ElsaNeural"
                    />
                    <TextField
                      label="Nome dispositivo"
                      value={voiceBridgeSettings.device_name}
                      onChange={value => updateVoiceBridgeSettings('device_name', value)}
                      placeholder="Home Assistant Voice PE"
                    />
                    <TextField
                      label="Modalita firmware"
                      value={voiceBridgeSettings.device_mode}
                      onChange={value => updateVoiceBridgeSettings('device_mode', value)}
                      placeholder="ptt o wake"
                    />
                    <TextField
                      label="Wake word desiderata"
                      value={voiceBridgeSettings.wake_word_label}
                      onChange={value => updateVoiceBridgeSettings('wake_word_label', value)}
                      placeholder="GEMMA"
                    />
                    <TextField
                      label="Modello wake word"
                      value={voiceBridgeSettings.wake_word_model}
                      onChange={value => updateVoiceBridgeSettings('wake_word_model', value)}
                      placeholder="URL o nome modello micro_wake_word"
                    />
                    <textarea
                      value={voiceBridgeSettings.wake_word_notes}
                      onChange={e => updateVoiceBridgeSettings('wake_word_notes', e.target.value)}
                      rows={3}
                      className="w-full bg-elevated border border-border rounded-xl px-3 py-2.5 text-xs text-secondary focus:text-primary focus:border-accent/50 focus:outline-none resize-none leading-relaxed transition-colors"
                    />
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 text-xs text-amber-300">
                      Il modello, la temperatura e il system prompt della voce arrivano dal profilo condiviso. Qui restano solo le opzioni davvero specifiche del canale voce.
                    </div>
                  </div>
                </SettingsSection>

                <SettingsSection icon={<Info className="w-4 h-4" />} title="Informazioni">
                  <div className="space-y-2 text-xs text-secondary">
                    <InfoRow label="Portale web" value="http://localhost:3000" />
                    <InfoRow label="Bridge voce" value={settings.bridgeUrl} />
                    <InfoRow label="Voice device ID" value={settings.voiceDeviceId} />
                    <InfoRow label="Cloud API" value="Nessuna" />
                    <InfoRow label="Dati inviati" value="Solo locale" />
                  </div>
                </SettingsSection>

                <button
                  onClick={() => {
                    setSettings(DEFAULT_SETTINGS);
                    setVoiceBridgeSettings(DEFAULT_VOICE_BRIDGE_SETTINGS);
                    setVoiceSettingsDirty(true);
                    setVoiceSettingsMessage(null);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-border text-sm text-secondary hover:bg-elevated hover:text-primary transition-colors"
                >
                  Ripristina predefiniti locali
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function WelcomeScreen({ onSuggestion }: { onSuggestion: (s: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-12 select-none">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center text-center max-w-xl"
      >
        <div className="mb-6"><GemcodeLogo size={48} /></div>
        <h1 className="text-3xl font-bold text-primary mb-2 tracking-tight">
          Ciao, come posso aiutarti?
        </h1>
        <p className="text-secondary text-base mb-10">
          AI locale · Chat web e bridge voce gestiti nello stesso pannello
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
          {SUGGESTION_CHIPS.map(chip => (
            <button
              key={chip}
              onClick={() => onSuggestion(chip)}
              className="text-left px-4 py-3.5 rounded-2xl border border-border bg-surface hover:bg-elevated hover:border-accent/40 transition-all text-sm text-secondary hover:text-primary leading-snug"
            >
              {chip}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message; key?: string }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const copy = () => {
    navigator.clipboard.writeText(message.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {!isUser && (
        <div className="shrink-0 mt-1 w-7 h-7 rounded-full bg-accent/15 border border-accent/20 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
        </div>
      )}
      <div className={`group relative max-w-[80%] flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isUser
              ? 'bg-accent/15 border border-accent/20 text-primary rounded-tr-sm'
              : 'text-primary rounded-tl-sm'
          }`}
        >
          {message.text}
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 ml-0.5 bg-accent/70 rounded-sm animate-pulse align-middle" />
          )}
        </div>
        {!message.isStreaming && message.text && (
          <button
            onClick={copy}
            className="opacity-0 group-hover:opacity-100 self-end flex items-center gap-1.5 text-xs text-muted hover:text-secondary transition-all px-1.5 py-0.5 rounded-md"
          >
            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copiato' : 'Copia'}
          </button>
        )}
      </div>
    </motion.div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-2xl px-4 py-3">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span className="whitespace-pre-wrap">{message}</span>
    </div>
  );
}

function BackendStatusDot({
  ollamaStatus,
}: {
  ollamaStatus: 'online' | 'offline' | 'checking';
}) {
  const isOk = ollamaStatus === 'online';
  const isChecking = ollamaStatus === 'checking';

  return (
    <span
      className={`w-2 h-2 rounded-full shrink-0 ${
        isChecking ? 'bg-yellow-400/60 animate-pulse' : isOk ? 'bg-green-400' : 'bg-red-400'
      }`}
    />
  );
}

function SettingsSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-muted">
        {icon}
        <h3 className="text-xs font-semibold uppercase tracking-wider">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0 gap-3">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-secondary text-right break-all">{value}</span>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs text-muted mb-1.5 block">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-primary focus:border-accent/50 focus:outline-none transition-colors"
        placeholder={placeholder}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div>
      <label className="text-xs text-muted mb-1.5 block">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-primary focus:border-accent/50 focus:outline-none transition-colors"
      />
    </div>
  );
}

function RangeField({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="text-xs text-muted mb-1.5 block">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full accent-accent"
      />
      <div className="flex justify-between text-xs text-muted mt-1">
        <span>{min}</span>
        <span className="font-mono text-accent font-medium">{value.toFixed(2)}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function StatusBadge({ status, label }: { status: 'ok' | 'error' | 'checking'; label: string }) {
  return (
    <span
      className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${
        status === 'ok'
          ? 'bg-green-500/15 text-green-400'
          : status === 'error'
            ? 'bg-red-500/15 text-red-400'
            : 'bg-yellow-500/15 text-yellow-400'
      }`}
    >
      {label}
    </span>
  );
}

function DeviceStatusCard({ status }: { status: VoiceDeviceStatus | null }) {
  if (!status) {
    return (
      <div className="rounded-xl border border-border bg-elevated/40 px-3 py-3 text-sm text-secondary">
        Nessun dato dal dispositivo. Verifica il bridge, il firmware e l'heartbeat del box.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-elevated/30 p-4 space-y-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-primary font-medium">{status.device_name}</p>
          <p className="text-xs text-muted">ID {status.device_id}</p>
        </div>
        <StatusBadge
          status={status.status === 'online' ? 'ok' : status.status === 'offline' ? 'error' : 'checking'}
          label={status.status}
        />
      </div>
      <InfoRow label="IP" value={status.remote_ip || 'n/d'} />
      <InfoRow label="Firmware" value={status.firmware_mode || 'n/d'} />
      <InfoRow label="Wake word" value={status.wake_word_label || 'n/d'} />
      <InfoRow label="Modello wake" value={status.wake_word_model || 'n/d'} />
      <InfoRow label="Ultimo heartbeat" value={status.last_seen_iso || 'n/d'} />
      <InfoRow label="Sessione voce" value={status.voice_session_status || 'idle'} />
      {status.last_transcript && (
        <div className="rounded-xl border border-border/70 bg-surface px-3 py-2">
          <p className="text-xs text-muted mb-1">Ultima trascrizione</p>
          <p className="text-xs text-secondary whitespace-pre-wrap">{status.last_transcript}</p>
        </div>
      )}
      {status.last_response_text && (
        <div className="rounded-xl border border-border/70 bg-surface px-3 py-2">
          <p className="text-xs text-muted mb-1">Ultima risposta vocale</p>
          <p className="text-xs text-secondary whitespace-pre-wrap">{status.last_response_text}</p>
        </div>
      )}
      {status.error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
          {status.error}
        </div>
      )}
    </div>
  );
}

function DeviceFleetCard({
  devices,
  selectedDeviceId,
  onSelect,
}: {
  devices: VoiceDeviceStatus[];
  selectedDeviceId: string;
  onSelect: (deviceId: string) => void;
}) {
  if (devices.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-elevated/40 px-3 py-3 text-sm text-secondary">
        Nessun dispositivo registrato sul bridge in questo momento.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {devices.map(device => {
        const selected = device.device_id === selectedDeviceId;
        return (
          <button
            key={device.device_id}
            onClick={() => onSelect(device.device_id)}
            className={`w-full text-left rounded-2xl border p-3 transition-colors ${
              selected
                ? 'border-accent/60 bg-accent/10'
                : 'border-border bg-elevated/30 hover:bg-elevated/50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-primary">{device.device_name}</p>
                <p className="text-xs text-muted">{device.device_id} · {device.remote_ip || 'n/d'}</p>
              </div>
              <StatusBadge
                status={device.status === 'online' ? 'ok' : device.status === 'offline' ? 'error' : 'checking'}
                label={device.status}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-secondary">
              <span className="rounded-full border border-border px-2 py-1">{device.firmware_mode || 'ptt'}</span>
              <span className="rounded-full border border-border px-2 py-1">wake: {device.wake_word_label || 'n/d'}</span>
              <span className="rounded-full border border-border px-2 py-1">sessione: {device.voice_session_status || 'idle'}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function BridgeHealthCard({ snapshot }: { snapshot: BridgeHealthSnapshot | null }) {
  if (!snapshot) {
    return (
      <div className="rounded-xl border border-border bg-elevated/40 px-3 py-3 text-sm text-secondary">
        Nessun dato health disponibile dal bridge.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-elevated/30 p-4 space-y-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-primary font-medium">Snapshot bridge</p>
            <p className="text-xs text-muted">Host pubblico {snapshot.public_host}</p>
          </div>
          <StatusBadge status="ok" label={snapshot.status} />
        </div>
        <InfoRow label="Dispositivi noti" value={String(snapshot.device_count)} />
        <InfoRow label="Sessioni attive" value={String(snapshot.active_sessions)} />
        <InfoRow label="Sessioni in errore" value={String(snapshot.error_sessions)} />
        <InfoRow label="Ultimo heartbeat" value={snapshot.latest_seen_iso || 'n/d'} />
        <InfoRow label="File config" value={snapshot.bridge_settings_file} />
        <InfoRow label="Porta HTTP" value={String(snapshot.ports.http)} />
        <InfoRow label="Porta Wyoming" value={String(snapshot.ports.wyoming)} />
        <InfoRow label="UDP audio" value={String(snapshot.ports.udp_audio)} />
        <InfoRow label="UDP control" value={String(snapshot.ports.udp_control)} />
        {snapshot.latest_audio_url && (
          <div className="rounded-xl border border-border/70 bg-surface px-3 py-2 space-y-2">
            <div>
              <p className="text-xs text-muted mb-1">Ultimo audio generato</p>
              <p className="text-xs text-secondary break-all">{snapshot.latest_audio_url}</p>
            </div>
            <audio controls src={snapshot.latest_audio_url} className="w-full" />
          </div>
        )}
        {snapshot.latest_transcript && (
          <div className="rounded-xl border border-border/70 bg-surface px-3 py-2">
            <p className="text-xs text-muted mb-1">Ultima trascrizione globale</p>
            <p className="text-xs text-secondary whitespace-pre-wrap">{snapshot.latest_transcript}</p>
          </div>
        )}
        {snapshot.latest_response_text && (
          <div className="rounded-xl border border-border/70 bg-surface px-3 py-2">
            <p className="text-xs text-muted mb-1">Ultima risposta globale</p>
            <p className="text-xs text-secondary whitespace-pre-wrap">{snapshot.latest_response_text}</p>
          </div>
        )}
        {snapshot.latest_error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400 whitespace-pre-wrap">
            {snapshot.latest_error}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-elevated/30 p-4 space-y-3 text-sm">
        <div>
          <p className="text-primary font-medium">Log recenti</p>
          <p className="text-xs text-muted">Coda locale del processo bridge</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-surface p-2 max-h-64 overflow-auto">
          {snapshot.recent_logs.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted">Nessun log disponibile.</p>
          ) : (
            <div className="space-y-1">
              {snapshot.recent_logs.slice().reverse().map((entry, index) => (
                <div key={`${entry.timestamp}-${index}`} className="rounded-lg px-2 py-1.5 text-xs border border-border/50 bg-elevated/40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted">{entry.timestamp}</span>
                    <span className={`font-medium ${entry.level === 'ERROR' ? 'text-red-400' : entry.level === 'WARNING' ? 'text-amber-300' : 'text-secondary'}`}>
                      {entry.level}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-secondary">{entry.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GemcodeLogo({ size = 28 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-xl bg-gradient-to-br from-accent via-blue-500 to-accent-hover flex items-center justify-center shrink-0 shadow-sm"
    >
      <Sparkles style={{ width: size * 0.5, height: size * 0.5 }} className="text-white" />
    </div>
  );
}
