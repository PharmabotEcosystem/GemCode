import React, { useRef, useEffect, useCallback } from 'react';
import { FileText, Mic, MicOff, Volume2, Send } from 'lucide-react';
import type { ChatAttachment, AppSettings } from '../types';
import { AttachmentChip } from './AttachmentChip';
import { FILE_PICKER_ACCEPT } from '../constants';
import { readAttachmentFile } from '../utils';

interface Props {
  input: string;
  setInput: (v: string) => void;
  onSend: (text: string) => void;
  isLoading: boolean;
  onStop: () => void;
  pendingAttachments: ChatAttachment[];
  setPendingAttachments: React.Dispatch<React.SetStateAction<ChatAttachment[]>>;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  // Speech recognition
  isListening: boolean;
  sttSupported: boolean;
  sttTranscript: string;
  onStartListening: () => void;
  onStopListening: () => void;
}

export function ChatInput({
  input, setInput, onSend, isLoading, onStop,
  pendingAttachments, setPendingAttachments,
  settings, setSettings,
  isListening, sttSupported, sttTranscript, onStartListening, onStopListening,
}: Props) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isImportingRef = useRef(false);

  // Sync STT transcript to input
  useEffect(() => {
    if (isListening && sttTranscript) {
      setInput(sttTranscript);
    }
  }, [sttTranscript, isListening, setInput]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(input); }
  };

  const openFilePicker = useCallback(() => fileInputRef.current?.click(), []);

  const importFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || isImportingRef.current) return;
    isImportingRef.current = true;
    try {
      const parsed = await Promise.all(Array.from(fileList).map(f => readAttachmentFile(f)));
      setPendingAttachments(prev => {
        const known = new Set(prev.map(a => a.id));
        return [...prev, ...parsed.filter(a => !known.has(a.id))];
      });
    } finally {
      isImportingRef.current = false;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [setPendingAttachments]);

  const removeAttachment = useCallback((id: string) => {
    setPendingAttachments(prev => prev.filter(a => a.id !== id));
  }, [setPendingAttachments]);

  const handleMicToggle = () => {
    if (isListening) { onStopListening(); } else { onStartListening(); }
  };

  return (
    <div className="shrink-0 px-4 pb-6 pt-2">
      <div className="max-w-3xl mx-auto">
        <input ref={fileInputRef} type="file" multiple accept={FILE_PICKER_ACCEPT}
          onChange={e => { void importFiles(e.target.files); }} className="hidden" />

        {pendingAttachments.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {pendingAttachments.map(att => <AttachmentChip key={att.id} attachment={att} onRemove={removeAttachment} />)}
          </div>
        )}

        <div className="relative flex items-end gap-3 bg-elevated border border-border rounded-2xl px-4 py-3 focus-within:border-accent/50 transition-colors shadow-sm">
          {/* File picker */}
          <button onClick={openFilePicker} disabled={isLoading}
            className="p-2 rounded-xl border border-border text-secondary hover:text-primary hover:border-accent/40 disabled:opacity-40 transition-colors"
            title="Allega file">
            <FileText className="w-4 h-4" />
          </button>

          {/* Text area with mic and controls */}
          <div className="relative flex-1 flex items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? 'Sto ascoltando...' : 'Scrivi un messaggio...'}
              className={`w-full bg-surface border border-border rounded-2xl pl-12 pr-24 py-3 text-sm focus:outline-none focus:border-accent/50 resize-none min-h-[44px] max-h-40 ${
                isListening ? 'border-red-400/50 bg-red-500/5' : ''
              }`}
              rows={1}
            />
            {/* Microphone button */}
            <button
              onClick={handleMicToggle}
              disabled={!sttSupported}
              className={`absolute left-3 bottom-2 p-2 transition-colors ${
                isListening ? 'text-red-400 animate-pulse' : 'text-muted hover:text-accent'
              } disabled:opacity-30 disabled:cursor-not-allowed`}
              title={!sttSupported ? 'Microfono non supportato dal browser' : isListening ? 'Ferma dettatura' : 'Avvia dettatura'}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* Right controls: auto-speak toggle + send */}
            <div className="absolute right-3 bottom-2 flex items-center gap-1">
              <button
                onClick={() => setSettings(s => ({ ...s, autoSpeak: !s.autoSpeak }))}
                className={`p-2 transition-colors ${settings.autoSpeak ? 'text-accent' : 'text-muted hover:text-secondary'}`}
                title={settings.autoSpeak ? 'Voce automatica attiva' : 'Voce automatica disattivata'}
              >
                <Volume2 className="w-5 h-5" />
              </button>
              {isLoading ? (
                <button onClick={onStop} className="p-2 rounded-xl bg-accent/10 text-accent hover:bg-accent/20 transition-colors" title="Interrompi">
                  <div className="w-3.5 h-3.5 rounded-sm bg-accent" />
                </button>
              ) : (
                <button onClick={() => onSend(input)} disabled={!input.trim() && pendingAttachments.length === 0}
                  className="p-2 bg-accent text-white rounded-xl disabled:opacity-40 hover:bg-accent-hover transition-colors" title="Invia (Enter)">
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
          <span>{isListening ? '🔴 Dettatura in corso...' : pendingAttachments.length > 0 ? `${pendingAttachments.length} allegati pronti` : 'Chat testuale o multimodale con allegati locali'}</span>
          <button onClick={openFilePicker} className="text-accent hover:text-accent-hover transition-colors">Apri file dal PC</button>
        </div>
      </div>
    </div>
  );
}
