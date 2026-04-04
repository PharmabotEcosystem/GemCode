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
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
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
  preview: string;
  timestamp: Date;
}

interface Settings {
  model: string;
  temperature: number;
  systemPrompt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODELS = [
  { id: 'gemini-2.5-flash-preview-05-20', label: 'Gemini 2.5 Flash', badge: 'Latest' },
  { id: 'gemini-2.0-flash',               label: 'Gemini 2.0 Flash', badge: null },
  { id: 'gemini-1.5-flash',               label: 'Gemini 1.5 Flash', badge: null },
];

const DEFAULT_SETTINGS: Settings = {
  model: 'gemini-2.5-flash-preview-05-20',
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

// ─── Gemini API ───────────────────────────────────────────────────────────────

function buildContents(messages: Message[]) {
  return messages.map(m => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [messages, setMessages]           = useState<Message[]>([]);
  const [input, setInput]                 = useState('');
  const [isLoading, setIsLoading]         = useState(false);
  const [sidebarOpen, setSidebarOpen]     = useState(true);
  const [settingsOpen, setSettingsOpen]   = useState(false);
  const [settings, setSettings]           = useState<Settings>(DEFAULT_SETTINGS);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId]   = useState<string | null>(null);
  const [error, setError]                 = useState<string | null>(null);

  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const inputRef        = useRef<HTMLTextAreaElement>(null);
  const abortRef        = useRef<boolean>(false);

  // Scroll al fondo quando arrivano nuovi messaggi
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

  const newChat = useCallback(() => {
    if (messages.length > 0) {
      const conv: Conversation = {
        id: Date.now().toString(),
        title: messages[0]?.text.slice(0, 40) || 'Nuova conversazione',
        preview: messages[messages.length - 1]?.text.slice(0, 60) || '',
        timestamp: new Date(),
      };
      setConversations(prev => [conv, ...prev.slice(0, 19)]);
    }
    setMessages([]);
    setActiveConvId(null);
    setError(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    setError(null);
    setInput('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      setError('GEMINI_API_KEY non configurata. Aggiungila al file .env.');
      return;
    }

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };

    const modelMsgId = `model-${Date.now()}`;
    const modelMsg: Message = {
      id: modelMsgId,
      role: 'model',
      text: '',
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMsg, modelMsg]);
    setIsLoading(true);
    abortRef.current = false;

    try {
      const ai = new GoogleGenAI({ apiKey });
      const history = buildContents([...messages, userMsg]);

      const stream = await ai.models.generateContentStream({
        model: settings.model,
        contents: history,
        config: {
          temperature: settings.temperature,
          systemInstruction: settings.systemPrompt,
        },
      });

      let accumulated = '';
      for await (const chunk of stream) {
        if (abortRef.current) break;
        const chunkText = chunk.text ?? '';
        accumulated += chunkText;
        setMessages(prev =>
          prev.map(m =>
            m.id === modelMsgId ? { ...m, text: accumulated } : m
          )
        );
      }

      setMessages(prev =>
        prev.map(m =>
          m.id === modelMsgId ? { ...m, isStreaming: false } : m
        )
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore sconosciuto';
      setMessages(prev => prev.filter(m => m.id !== modelMsgId));
      setError(`Errore: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, settings]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const stopGeneration = () => {
    abortRef.current = true;
    setIsLoading(false);
    setMessages(prev =>
      prev.map(m => m.isStreaming ? { ...m, isStreaming: false } : m)
    );
  };

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
            {/* Logo */}
            <div className="flex items-center gap-3 px-4 py-5 border-b border-border">
              <GemcodeLogo />
              <span className="font-semibold text-primary text-base tracking-tight">GemCode</span>
            </div>

            {/* New Chat */}
            <div className="px-3 py-3">
              <button
                onClick={newChat}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-secondary hover:bg-elevated hover:text-primary transition-colors"
              >
                <Plus className="w-4 h-4 shrink-0" />
                Nuova chat
              </button>
            </div>

            {/* Conversation history */}
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
              {conversations.length > 0 && (
                <p className="px-3 py-2 text-xs font-medium text-muted uppercase tracking-wider">
                  Recenti
                </p>
              )}
              {conversations.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => setActiveConvId(conv.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors group ${
                    activeConvId === conv.id
                      ? 'bg-elevated text-primary'
                      : 'text-secondary hover:bg-elevated/60 hover:text-primary'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted" />
                    <span className="truncate leading-snug">{conv.title}</span>
                  </div>
                </button>
              ))}
              {conversations.length === 0 && (
                <p className="px-3 py-4 text-xs text-muted text-center">
                  Le conversazioni appariranno qui
                </p>
              )}
            </div>

            {/* Bottom actions */}
            <div className="border-t border-border px-3 py-3 space-y-0.5">
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

        {/* Top bar */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface/80 backdrop-blur shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(v => !v)}
              className="p-2 rounded-lg text-secondary hover:bg-elevated hover:text-primary transition-colors"
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {!sidebarOpen && <GemcodeLogo />}
          </div>

          {/* Model badge */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-elevated border border-border text-xs font-medium text-secondary hover:text-primary hover:border-accent/50 transition-colors"
            >
              <Cpu className="w-3.5 h-3.5" />
              {MODELS.find(m => m.id === settings.model)?.label ?? settings.model}
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

        {/* Chat area */}
        <main className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <WelcomeScreen
              onSuggestion={(s) => sendMessage(s)}
            />
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
              {messages.map(msg => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {error && (
                <div className="flex items-start gap-3 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-2xl px-4 py-3">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* Error (welcome screen) */}
        {error && messages.length === 0 && (
          <div className="max-w-3xl mx-auto w-full px-4 pb-2">
            <div className="flex items-start gap-3 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-2xl px-4 py-3">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          </div>
        )}

        {/* Input bar */}
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
              <div className="flex items-center gap-2 shrink-0 pb-0.5">
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
              GemCode · {MODELS.find(m => m.id === settings.model)?.label} · Shift+Enter per nuova riga
            </p>
          </div>
        </div>
      </div>

      {/* ── Settings Panel ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {settingsOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setSettingsOpen(false)}
            />
            {/* Panel */}
            <motion.div
              key="settings-panel"
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

                {/* Model */}
                <SettingsSection icon={<Cpu className="w-4 h-4" />} title="Modello">
                  <div className="space-y-2">
                    {MODELS.map(m => (
                      <label
                        key={m.id}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                          settings.model === m.id
                            ? 'border-accent/60 bg-accent/10 text-primary'
                            : 'border-border hover:border-accent/30 text-secondary hover:text-primary'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="radio"
                            name="model"
                            value={m.id}
                            checked={settings.model === m.id}
                            onChange={() => setSettings(s => ({ ...s, model: m.id }))}
                            className="accent-accent"
                          />
                          <span className="text-sm font-medium">{m.label}</span>
                        </div>
                        {m.badge && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent font-medium">
                            {m.badge}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </SettingsSection>

                {/* Temperature */}
                <SettingsSection icon={<Thermometer className="w-4 h-4" />} title="Temperatura">
                  <div className="space-y-2">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={settings.temperature}
                      onChange={e => setSettings(s => ({ ...s, temperature: parseFloat(e.target.value) }))}
                      className="w-full accent-accent"
                    />
                    <div className="flex justify-between text-xs text-muted">
                      <span>Preciso (0)</span>
                      <span className="font-mono text-accent font-medium">{settings.temperature.toFixed(2)}</span>
                      <span>Creativo (1)</span>
                    </div>
                  </div>
                </SettingsSection>

                {/* System prompt */}
                <SettingsSection icon={<FileText className="w-4 h-4" />} title="Istruzioni di sistema">
                  <textarea
                    value={settings.systemPrompt}
                    onChange={e => setSettings(s => ({ ...s, systemPrompt: e.target.value }))}
                    rows={6}
                    className="w-full bg-elevated border border-border rounded-xl px-3 py-2.5 text-xs text-secondary focus:text-primary focus:border-accent/50 focus:outline-none resize-none leading-relaxed transition-colors"
                    placeholder="Descrivi il comportamento del modello…"
                  />
                </SettingsSection>

                {/* Theme note */}
                <SettingsSection icon={<Moon className="w-4 h-4" />} title="Aspetto">
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-border">
                    <span className="text-sm text-secondary">Tema scuro</span>
                    <span className="text-xs text-muted">Attivo</span>
                  </div>
                </SettingsSection>

                {/* About */}
                <SettingsSection icon={<Info className="w-4 h-4" />} title="Informazioni">
                  <div className="space-y-2 text-xs text-secondary">
                    <InfoRow label="Versione" value="1.0.0" />
                    <InfoRow label="Modello attivo" value={MODELS.find(m => m.id === settings.model)?.label ?? '—'} />
                    <InfoRow label="SDK" value="@google/genai 1.29" />
                  </div>
                </SettingsSection>

                {/* Reset */}
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
        <div className="mb-6">
          <GemcodeLogo size={48} />
        </div>
        <h1 className="text-3xl font-bold text-primary mb-2 tracking-tight">
          Ciao, come posso aiutarti?
        </h1>
        <p className="text-secondary text-base mb-10">
          Powered by Gemini · GemCode AI Assistant
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
          {SUGGESTION_CHIPS.map((chip) => (
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

function MessageBubble({ message }: { message: Message }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const copyText = () => {
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
      {/* Avatar */}
      {!isUser && (
        <div className="shrink-0 mt-1 w-7 h-7 rounded-full bg-accent/15 border border-accent/20 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
        </div>
      )}

      {/* Bubble */}
      <div className={`group relative max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
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

        {/* Copy button */}
        {!message.isStreaming && message.text && (
          <button
            onClick={copyText}
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

// ─── Settings Helpers ─────────────────────────────────────────────────────────

function SettingsSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
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
