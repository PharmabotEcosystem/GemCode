import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Moon,
  Copy,
  Check,
  Server,
  Wifi,
  WifiOff,
  AlertCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Types ────────────────────────────────────────────────────────────────────

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

type InferenceBackend = 'window-ai' | 'ollama';

interface AppSettings {
  backend: InferenceBackend;
  ollamaHost: string;
  ollamaModel: string;
  temperature: number;
  systemPrompt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: AppSettings = {
  backend: 'ollama',
  // Default: Android agent in esecuzione sulla stessa macchina o rete locale.
  // Cambia l'IP con quello del dispositivo Android (es. http://192.168.1.100:8080).
  // L'agent espone POST /api/chat in formato Ollama-compatible su porta 8080.
  ollamaHost: 'http://localhost:8080',
  ollamaModel: 'gemma4',
  temperature: 0.7,
  systemPrompt:
    'Sei GemCode Assistant, un assistente AI utile, preciso e conciso. ' +
    'Rispondi sempre in modo chiaro e diretto. ' +
    'Se non conosci qualcosa, dillo esplicitamente senza inventare.',
};

const SUGGESTION_CHIPS = [
  'Spiega come funziona un Transformer',
  'Scrivi un\'API REST in Kotlin con Ktor',
  'Cos\'è il pattern ReAct negli agenti AI?',
  'Crea uno script Python per analizzare un CSV',
];

// ─── Window AI types (Chrome 128+ built-in Gemini Nano) ──────────────────────

declare global {
  interface Window {
    ai?: {
      languageModel?: {
        capabilities(): Promise<{ available: 'readily' | 'after-download' | 'no' }>;
        create(options?: {
          systemPrompt?: string;
          temperature?: number;
        }): Promise<{
          promptStreaming(prompt: string): ReadableStream<string>;
          destroy(): void;
        }>;
      };
    };
  }
}

// ─── Inference engines ────────────────────────────────────────────────────────

/**
 * Chiama l'API Ollama locale (http://localhost:11434/api/chat).
 * Ritorna un AsyncGenerator che emette i token man mano che arrivano.
 */
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
        // ignora linee malformate
      }
    }
  }
}

/**
 * Usa window.ai.languageModel (Chrome 128+ con Gemini Nano integrato).
 * Ritorna un AsyncGenerator che emette chunk di testo incrementali.
 */
async function* windowAiStream(
  userPrompt: string,
  systemPrompt: string,
  temperature: number,
  signal: AbortSignal
): AsyncGenerator<string> {
  const ai = window.ai?.languageModel;
  if (!ai) throw new Error('window.ai non disponibile. Usa Chrome 128+ e abilita chrome://flags/#prompt-api-for-gemini-nano');

  const capabilities = await ai.capabilities();
  if (capabilities.available === 'no') {
    throw new Error('Gemini Nano non è supportato su questo dispositivo.');
  }
  if (capabilities.available === 'after-download') {
    throw new Error('Gemini Nano deve ancora essere scaricato. Attendi il completamento del download in Chrome.');
  }

  const session = await ai.create({ systemPrompt, temperature });

  try {
    const stream = session.promptStreaming(userPrompt);
    const reader = stream.getReader();
    let lastLength = 0;

    while (true) {
      if (signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      // window.ai emette il testo accumulato — estraiamo solo il delta
      const delta = value.slice(lastLength);
      lastLength = value.length;
      if (delta) yield delta;
    }
    reader.releaseLock();
  } finally {
    session.destroy();
  }
}

// ─── Backend status check ─────────────────────────────────────────────────────

async function checkOllamaStatus(host: string): Promise<'online' | 'offline'> {
  try {
    const resp = await fetch(`${host.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return resp.ok ? 'online' : 'offline';
  } catch {
    return 'offline';
  }
}

async function checkWindowAiStatus(): Promise<'available' | 'unavailable'> {
  try {
    const cap = await window.ai?.languageModel?.capabilities();
    return cap?.available === 'readily' ? 'available' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [messages, setMessages]           = useState<Message[]>([]);
  const [input, setInput]                 = useState('');
  const [isLoading, setIsLoading]         = useState(false);
  const [sidebarOpen, setSidebarOpen]     = useState(true);
  const [settingsOpen, setSettingsOpen]   = useState(false);
  const [settings, setSettings]           = useState<AppSettings>(DEFAULT_SETTINGS);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [error, setError]                 = useState<string | null>(null);
  const [ollamaStatus, setOllamaStatus]   = useState<'online' | 'offline' | 'checking'>('checking');
  const [windowAiStatus, setWindowAiStatus] = useState<'available' | 'unavailable' | 'checking'>('checking');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const abortRef       = useRef<AbortController | null>(null);

  // Check backend status on mount and when settings change
  useEffect(() => {
    setOllamaStatus('checking');
    checkOllamaStatus(settings.ollamaHost).then(setOllamaStatus);
  }, [settings.ollamaHost]);

  useEffect(() => {
    setWindowAiStatus('checking');
    checkWindowAiStatus().then(setWindowAiStatus);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

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

      if (settings.backend === 'window-ai') {
        gen = windowAiStream(trimmed, settings.systemPrompt, settings.temperature, controller.signal);
      } else {
        // Ollama: prepend system message
        const ollamaMessages = [
          { role: 'system', content: settings.systemPrompt },
          ...history,
        ];
        gen = ollamaStream(
          settings.ollamaHost,
          settings.ollamaModel,
          ollamaMessages,
          settings.temperature,
          controller.signal
        );
      }

      let accumulated = '';
      for await (const token of gen) {
        if (controller.signal.aborted) break;
        accumulated += token;
        setMessages(prev =>
          prev.map(m => (m.id === modelId ? { ...m, text: accumulated } : m))
        );
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

  const activeBackendLabel =
    settings.backend === 'window-ai'
      ? 'Gemini Nano (locale)'
      : `${settings.ollamaModel} · Ollama`;

  return (
    <div className="flex h-screen bg-base text-primary overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
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

            <div className="border-t border-border px-3 py-3 space-y-0.5">
              {/* Backend status */}
              <div className="px-3 py-2 flex items-center gap-2 text-xs text-muted">
                <BackendStatusDot backend={settings.backend} ollamaStatus={ollamaStatus} windowAiStatus={windowAiStatus} />
                <span className="truncate">{activeBackendLabel}</span>
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

      {/* ── Main ────────────────────────────────────────────────────────────── */}
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
              <BackendStatusDot backend={settings.backend} ollamaStatus={ollamaStatus} windowAiStatus={windowAiStatus} />
              {activeBackendLabel}
            </button>
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
                placeholder="Scrivi un messaggio…"
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
              GemCode · {activeBackendLabel} · Shift+Enter per nuova riga
            </p>
          </div>
        </div>
      </div>

      {/* ── Settings Panel ───────────────────────────────────────────────────── */}
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
              className="fixed right-0 top-0 h-full w-80 bg-surface border-l border-border z-50 flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="font-semibold text-primary">Impostazioni</h2>
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="p-1.5 rounded-lg text-secondary hover:bg-elevated hover:text-primary transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

                {/* Backend selector */}
                <SettingsSection icon={<Cpu className="w-4 h-4" />} title="Motore di inferenza">
                  <div className="space-y-2">
                    <BackendCard
                      active={settings.backend === 'ollama'}
                      onClick={() => setSettings(s => ({ ...s, backend: 'ollama' }))}
                      icon={<Server className="w-4 h-4" />}
                      title="GemCode Agent / Ollama"
                      description="Android agent locale su porta 8080"
                      status={ollamaStatus === 'online' ? 'ok' : ollamaStatus === 'offline' ? 'error' : 'checking'}
                      statusLabel={ollamaStatus === 'online' ? 'Online' : ollamaStatus === 'offline' ? 'Non raggiungibile' : '…'}
                    />
                    <BackendCard
                      active={settings.backend === 'window-ai'}
                      onClick={() => setSettings(s => ({ ...s, backend: 'window-ai' }))}
                      icon={<Sparkles className="w-4 h-4" />}
                      title="Chrome AI"
                      description="Gemini Nano integrato nel browser"
                      status={windowAiStatus === 'available' ? 'ok' : windowAiStatus === 'unavailable' ? 'error' : 'checking'}
                      statusLabel={windowAiStatus === 'available' ? 'Disponibile' : windowAiStatus === 'unavailable' ? 'Non disponibile' : '…'}
                    />
                  </div>
                </SettingsSection>

                {/* Ollama config */}
                {settings.backend === 'ollama' && (
                  <SettingsSection icon={<Server className="w-4 h-4" />} title="Configurazione Ollama">
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-muted mb-1.5 block">Host</label>
                        <input
                          type="text"
                          value={settings.ollamaHost}
                          onChange={e => setSettings(s => ({ ...s, ollamaHost: e.target.value }))}
                          className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-primary focus:border-accent/50 focus:outline-none transition-colors"
                          placeholder="http://localhost:11434"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted mb-1.5 block">Modello</label>
                        <input
                          type="text"
                          value={settings.ollamaModel}
                          onChange={e => setSettings(s => ({ ...s, ollamaModel: e.target.value }))}
                          className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-primary focus:border-accent/50 focus:outline-none transition-colors"
                          placeholder="gemma4"
                        />
                        <p className="text-xs text-muted mt-1.5">
                          GemCode Agent: <span className="font-mono">gemma4</span> · Ollama: gemma3:4b · llama3.2
                        </p>
                      </div>
                      {ollamaStatus === 'offline' && (
                        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2.5 text-xs text-red-400 space-y-1.5">
                          <p className="font-medium">Server non raggiungibile</p>
                          <p className="text-red-400/80 font-medium mt-1">Android Agent (GemCode):</p>
                          <p className="text-red-400/70">1. Installa e avvia l'app GemCode su Android</p>
                          <p className="text-red-400/70">2. Scarica un modello Gemma nell'app</p>
                          <p className="text-red-400/70">3. Imposta l'host sull'IP del dispositivo:</p>
                          <p className="text-red-400/70 font-mono bg-red-500/10 px-1.5 py-0.5 rounded">http://&lt;IP-Android&gt;:8080</p>
                          <p className="text-red-400/80 font-medium mt-1">Oppure Ollama locale:</p>
                          <p className="text-red-400/70 font-mono bg-red-500/10 px-1.5 py-0.5 rounded">ollama serve</p>
                          <p className="text-red-400/70 font-mono bg-red-500/10 px-1.5 py-0.5 rounded">ollama pull {settings.ollamaModel}</p>
                        </div>
                      )}
                    </div>
                  </SettingsSection>
                )}

                {/* Chrome AI info */}
                {settings.backend === 'window-ai' && windowAiStatus === 'unavailable' && (
                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2.5 text-xs text-amber-400 space-y-1">
                    <p className="font-medium">Gemini Nano non disponibile</p>
                    <p className="text-amber-400/80">Richiede Chrome 128+ su desktop.</p>
                    <p className="text-amber-400/80">Abilita: <code className="font-mono bg-amber-500/10 px-1 rounded">chrome://flags/#prompt-api-for-gemini-nano</code></p>
                  </div>
                )}

                {/* Temperature */}
                <SettingsSection icon={<Thermometer className="w-4 h-4" />} title="Temperatura">
                  <input
                    type="range" min={0} max={1} step={0.05}
                    value={settings.temperature}
                    onChange={e => setSettings(s => ({ ...s, temperature: parseFloat(e.target.value) }))}
                    className="w-full accent-accent"
                  />
                  <div className="flex justify-between text-xs text-muted mt-1">
                    <span>Preciso (0)</span>
                    <span className="font-mono text-accent font-medium">{settings.temperature.toFixed(2)}</span>
                    <span>Creativo (1)</span>
                  </div>
                </SettingsSection>

                {/* System prompt */}
                <SettingsSection icon={<FileText className="w-4 h-4" />} title="Istruzioni di sistema">
                  <textarea
                    value={settings.systemPrompt}
                    onChange={e => setSettings(s => ({ ...s, systemPrompt: e.target.value }))}
                    rows={5}
                    className="w-full bg-elevated border border-border rounded-xl px-3 py-2.5 text-xs text-secondary focus:text-primary focus:border-accent/50 focus:outline-none resize-none leading-relaxed transition-colors"
                  />
                </SettingsSection>

                {/* Info */}
                <SettingsSection icon={<Info className="w-4 h-4" />} title="Informazioni">
                  <div className="space-y-2 text-xs text-secondary">
                    <InfoRow label="Versione" value="1.0.0" />
                    <InfoRow label="Cloud API" value="Nessuna" />
                    <InfoRow label="Dati inviati" value="Solo locale" />
                  </div>
                </SettingsSection>

                <button
                  onClick={() => setSettings(DEFAULT_SETTINGS)}
                  className="w-full px-3 py-2.5 rounded-xl border border-border text-sm text-secondary hover:bg-elevated hover:text-primary transition-colors"
                >
                  Ripristina predefiniti
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Welcome Screen ───────────────────────────────────────────────────────────

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
          AI locale · Nessun dato inviato al cloud
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

// ─── Message Bubble ───────────────────────────────────────────────────────────

// React 19: key is now a regular prop — must be declared in the component's prop type
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

// ─── Error Banner ─────────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-2xl px-4 py-3">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span className="whitespace-pre-wrap">{message}</span>
    </div>
  );
}

// ─── Backend Status ───────────────────────────────────────────────────────────

function BackendStatusDot({
  backend, ollamaStatus, windowAiStatus,
}: {
  backend: InferenceBackend;
  ollamaStatus: 'online' | 'offline' | 'checking';
  windowAiStatus: 'available' | 'unavailable' | 'checking';
}) {
  const isOk =
    (backend === 'ollama' && ollamaStatus === 'online') ||
    (backend === 'window-ai' && windowAiStatus === 'available');
  const isChecking =
    (backend === 'ollama' && ollamaStatus === 'checking') ||
    (backend === 'window-ai' && windowAiStatus === 'checking');

  return (
    <span
      className={`w-2 h-2 rounded-full shrink-0 ${
        isChecking ? 'bg-yellow-400/60 animate-pulse' :
        isOk ? 'bg-green-400' : 'bg-red-400'
      }`}
    />
  );
}

function BackendCard({
  active, onClick, icon, title, description, status, statusLabel,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  status: 'ok' | 'error' | 'checking';
  statusLabel: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-3 rounded-xl border transition-colors ${
        active
          ? 'border-accent/60 bg-accent/10'
          : 'border-border hover:border-accent/30 hover:bg-elevated/50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={active ? 'text-accent' : 'text-secondary'}>{icon}</span>
          <div>
            <p className={`text-sm font-medium ${active ? 'text-primary' : 'text-secondary'}`}>{title}</p>
            <p className="text-xs text-muted">{description}</p>
          </div>
        </div>
        <span
          className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${
            status === 'ok' ? 'bg-green-500/15 text-green-400' :
            status === 'error' ? 'bg-red-500/15 text-red-400' :
            'bg-yellow-500/15 text-yellow-400'
          }`}
        >
          {statusLabel}
        </span>
      </div>
    </button>
  );
}

// ─── Settings Helpers ─────────────────────────────────────────────────────────

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
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-secondary">{value}</span>
    </div>
  );
}

// ─── Logo ─────────────────────────────────────────────────────────────────────

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
