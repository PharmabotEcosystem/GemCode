import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2, Wifi, WifiOff } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import type { Message, Conversation, ChatAttachment } from './types';
import { useSettings } from './hooks/useSettings';
import { useBridge } from './hooks/useBridge';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis';
import { ollamaStream, checkOllamaStatus, fetchModelOptions } from './api';
import { buildDisplayText, buildPromptText, extractMessageImages } from './utils';
import type { ModelOption } from './types';

import { Sidebar } from './components/Sidebar';
import { WelcomeScreen } from './components/WelcomeScreen';
import { MessageBubble } from './components/MessageBubble';
import { ChatInput } from './components/ChatInput';
import { SettingsPanel } from './components/SettingsPanel';
import { ErrorBanner } from './components/ui/ErrorBanner';
import { GemcodeLogo } from './components/ui/GemcodeLogo';
import { BackendStatusDot } from './components/ui/StatusBadge';
import { CompanionView } from './components/CompanionView';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export default function App() {
  /* ── Core state ──────────────────────────────────── */
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [currentView, setCurrentView] = useState<'chat' | 'companion'>('chat');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* ── Hooks ───────────────────────────────────────── */
  const { settings, setSettings } = useSettings();
  const bridge = useBridge(settings);
  const stt = useSpeechRecognition('it-IT');
  const tts = useSpeechSynthesis();

  /* ── Effects ─────────────────────────────────────── */
  useEffect(() => {
    setOllamaStatus('checking');
    checkOllamaStatus(settings.ollamaHost).then(setOllamaStatus);
  }, [settings.ollamaHost]);

  useEffect(() => {
    let cancelled = false;
    fetchModelOptions(settings.ollamaHost)
      .then(m => { if (!cancelled) setModelOptions(m); })
      .catch(() => { if (!cancelled) setModelOptions([]); });
    return () => { cancelled = true; };
  }, [settings.ollamaHost]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* ── Handlers ────────────────────────────────────── */
  const activeBackendLabel = `${settings.ollamaModel} · Profilo condiviso`;

  const newChat = useCallback(() => {
    if (messages.length > 0) {
      setConversations(prev => [
        { id: Date.now().toString(), title: messages[0].text.slice(0, 45), timestamp: new Date() },
        ...prev.slice(0, 19),
      ]);
    }
    setMessages([]);
    setError(null);
  }, [messages]);

  const handleSpeak = useCallback((text: string) => {
    if (settings.ttsMode === 'bridge') {
      tts.speakViaBridge(text, settings.bridgeUrl, settings.voiceDeviceId);
    } else {
      tts.speak(text);
    }
  }, [settings.ttsMode, settings.bridgeUrl, settings.voiceDeviceId, tts]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    const outgoing = [...pendingAttachments];
    if ((!trimmed && outgoing.length === 0) || isLoading) return;

    setError(null);
    setInput('');
    setPendingAttachments([]);

    const userMsg: Message = {
      id: `u-${Date.now()}`, role: 'user',
      text: buildDisplayText(trimmed, outgoing),
      apiText: buildPromptText(trimmed, outgoing),
      attachments: outgoing,
    };
    const modelId = `m-${Date.now()}`;
    const modelMsg: Message = { id: modelId, role: 'model', text: '', isStreaming: true };

    setMessages(prev => [...prev, userMsg, modelMsg]);
    setIsLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const history = [...messages, userMsg].map(m => ({
        role: m.role === 'model' ? 'assistant' : 'user',
        content: m.role === 'user' ? m.apiText ?? m.text : m.text,
        ...(m.role === 'user' && extractMessageImages(m.attachments).length > 0
          ? { images: extractMessageImages(m.attachments) } : {}),
      }));

      const gen = ollamaStream(
        settings.ollamaHost, settings.ollamaModel,
        [{ role: 'system', content: settings.systemPrompt }, ...history],
        {
          temperature: settings.temperature,
          topK: settings.topK ?? 40,
          topP: settings.topP ?? 0.9,
          repeatPenalty: settings.repeatPenalty ?? 1.1,
          numPredict: settings.numPredict ?? 1024,
          numCtx: settings.numCtx ?? 4096
        },
        controller.signal,
      );

      let accumulated = '';
      for await (const token of gen) {
        if (controller.signal.aborted) break;
        accumulated += token;
        setMessages(prev => prev.map(m => m.id === modelId ? { ...m, text: accumulated } : m));
      }

      // Auto-speak
      if (settings.autoSpeak && accumulated.trim()) {
        handleSpeak(accumulated);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages(prev => prev.filter(m => m.id !== modelId));
      setError(msg);
    } finally {
      setIsLoading(false);
      setMessages(prev => prev.map(m => m.id === modelId ? { ...m, isStreaming: false } : m));
      abortRef.current = null;
    }
  }, [isLoading, messages, pendingAttachments, settings, handleSpeak]);

  const stopGeneration = () => abortRef.current?.abort();

  /* ── Render ──────────────────────────────────────── */
  return (
    <div className="flex h-screen bg-base text-primary overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <Sidebar
            conversations={conversations}
            onNewChat={newChat}
            onOpenSettings={() => setSettingsOpen(true)}
            ollamaStatus={ollamaStatus}
            activeBackendLabel={activeBackendLabel}
            voiceDeviceStatus={bridge.voiceDeviceStatus}
            voiceDeviceId={settings.voiceDeviceId}
            onClose={() => setSidebarOpen(false)}
            onSwitchView={setCurrentView}
            currentView={currentView}
          />
        )}
      </AnimatePresence>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {currentView === 'companion' ? (
          <CompanionView 
            messages={messages}
            onSendMessage={sendMessage}
            isLoading={isLoading}
            settings={settings}
            stt={{
              transcript: stt.transcript,
              isListening: stt.isListening,
              start: stt.startListening,
              stop: stt.stopListening
            }}
            onOpenSettings={() => setSettingsOpen(true)}
            isSpeaking={tts.isSpeaking}
          />
        ) : (
          <>
            {/* Header */}
            <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface/80 backdrop-blur shrink-0">
              <div className="flex items-center gap-2">
                <button onClick={() => setSidebarOpen(v => !v)}
                  className="p-2 rounded-lg text-secondary hover:bg-elevated hover:text-primary transition-colors">
                  {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                {!sidebarOpen && <GemcodeLogo />}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setSettingsOpen(true)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-elevated border border-border text-xs font-medium text-secondary hover:text-primary hover:border-accent/50 transition-colors">
                  <BackendStatusDot ollamaStatus={ollamaStatus} />
                  {activeBackendLabel}
                </button>
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-elevated border border-border text-xs font-medium text-secondary">
                  {bridge.voiceDeviceStatus?.status === 'online'
                    ? <Wifi className="w-3.5 h-3.5 text-green-400" />
                    : <WifiOff className="w-3.5 h-3.5 text-red-400" />}
                  <span>{bridge.voiceDeviceStatus?.status === 'online' ? 'Dispositivo attivo' : 'Dispositivo offline'}</span>
                </div>
                {messages.length > 0 && (
                  <button onClick={newChat} className="p-2 rounded-lg text-secondary hover:bg-elevated hover:text-primary transition-colors" title="Nuova chat">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </header>

            {/* Messages area */}
            <main className="flex-1 overflow-y-auto">
              {messages.length === 0 ? (
                <WelcomeScreen onSuggestion={sendMessage} />
              ) : (
                <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
                  {messages.map(msg => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      onSpeak={handleSpeak}
                      onStopSpeaking={tts.stop}
                      isSpeaking={tts.isSpeaking}
                    />
                  ))}
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

            {/* Chat input */}
            <ChatInput
              input={input}
              setInput={setInput}
              onSend={sendMessage}
              isLoading={isLoading}
              onStop={stopGeneration}
              pendingAttachments={pendingAttachments}
              setPendingAttachments={setPendingAttachments}
              settings={settings}
              setSettings={setSettings}
              isListening={stt.isListening}
              sttSupported={stt.isSupported}
              sttTranscript={stt.transcript}
              onStartListening={stt.startListening}
              onStopListening={stt.stopListening}
            />
          </>
        )}
      </div>

      {/* Settings panel */}
      <AnimatePresence>
        {settingsOpen && (
          <SettingsPanel
            onClose={() => setSettingsOpen(false)}
            settings={settings}
            setSettings={setSettings}
            modelOptions={modelOptions}
            voiceBridgeStatus={bridge.voiceBridgeStatus}
            voiceBridgeSettings={bridge.voiceBridgeSettings}
            voiceDeviceStatus={bridge.voiceDeviceStatus}
            bridgeHealth={bridge.bridgeHealth}
            updateVoiceBridgeSettings={bridge.updateVoiceBridgeSettings}
            voiceSettingsMessage={bridge.voiceSettingsMessage}
            setVoiceBridgeSettings={bridge.setVoiceBridgeSettings}
            pendingAttachments={pendingAttachments}
            setPendingAttachments={setPendingAttachments}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
