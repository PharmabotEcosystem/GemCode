import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, Mic, MicOff, Settings, Sparkles, Send, X, User } from 'lucide-react';
import { CompanionCanvas } from './CompanionCanvas';
import { MessageBubble } from './MessageBubble';
import type { Message, AppSettings } from '../types';

interface Props {
  messages: Message[];
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  settings: AppSettings;
  stt: {
    transcript: string;
    isListening: boolean;
    start: () => void;
    stop: () => void;
  };
  onOpenSettings: () => void;
  isSpeaking?: boolean;
}

export function CompanionView({ messages, onSendMessage, isLoading, settings, stt, onOpenSettings, isSpeaking }: Props) {
  const [inputText, setInputText] = useState('');
  const [chatVisible, setChatVisible] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chatVisible]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    onSendMessage(inputText);
    setInputText('');
  };

  return (
    <div className="relative w-full h-full bg-background overflow-hidden flex flex-col md:flex-row">
      
      {/* 3D Background / Main Stage */}
      <div className="flex-1 relative order-2 md:order-1 h-[60vh] md:h-full">
        <CompanionCanvas url={settings.companionVrmUrl} isSpeaking={isSpeaking} />
        
        {/* Floating Header info */}
        <div className="absolute top-6 left-6 z-10 flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-primary tracking-tight flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent animate-pulse" />
            GemCode Companion
          </h1>
          <p className="text-xs text-muted font-medium bg-surface/40 backdrop-blur-md px-2 py-1 rounded-md inline-block w-fit">
            {settings.ollamaModel} · AI-Driven Avatar
          </p>
        </div>

        {/* Toggle Chat button (mobile-ish) */}
        <button 
          onClick={() => setChatVisible(!chatVisible)}
          className="absolute bottom-6 left-6 z-10 p-3 bg-elevated/80 backdrop-blur-xl border border-border/50 rounded-full text-secondary hover:text-primary shadow-2xl transition-all"
        >
          <MessageSquare className="w-6 h-6" />
        </button>
      </div>

      {/* Side Chat Interface (ROS_KAI Style) */}
      <AnimatePresence>
        {chatVisible && (
          <motion.div 
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="w-full md:w-[400px] h-full bg-surface/60 backdrop-blur-3xl border-l border-border/50 flex flex-col z-20 order-1 md:order-2"
          >
            {/* Sidebar Header */}
            <div className="px-6 py-5 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-accent/10 border border-accent/20">
                  <User className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-primary leading-none mb-1">Interazione Vocale</h3>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-accent animate-pulse' : 'bg-green-500'}`} />
                    <span className="text-[10px] uppercase font-bold text-muted tracking-wider">{isLoading ? 'In ascolto...' : 'Online'}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setChatVisible(false)} className="md:hidden p-1.5 rounded-lg text-muted hover:bg-elevated transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Messages Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-accent/5 border border-accent/10 flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-accent/20" />
                  </div>
                  <p className="text-sm text-muted">Ciao! Sono il tuo Companion 3D.<br/>Come posso aiutarti oggi?</p>
                </div>
              ) : (
                messages.map(msg => (
                  <MessageBubble key={msg.id} message={msg} />
                ))
              )}
              {isLoading && (
                 <div className="flex gap-2 p-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
                 </div>
              )}
            </div>

            {/* Floating Input Area */}
            <div className="p-6 border-t border-border/50 bg-surface/40 backdrop-blur-sm">
              <form onSubmit={handleSubmit} className="relative group">
                <div className="absolute inset-0 bg-accent/5 rounded-2xl blur-xl group-focus-within:bg-accent/10 transition-all opacity-0 group-focus-within:opacity-100" />
                <div className="relative flex items-center gap-2 p-2 bg-elevated/80 border border-border/50 rounded-2xl shadow-lg focus-within:border-accent/40 transition-all">
                  
                  <button 
                    type="button"
                    onClick={stt.isListening ? stt.stop : stt.start}
                    className={`p-3 rounded-xl transition-all ${stt.isListening ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/20' : 'text-muted hover:text-accent hover:bg-accent/5'}`}
                  >
                    {stt.isListening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                  </button>

                  <input 
                    type="text"
                    value={inputText || stt.transcript}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Chiedi qualcosa..."
                    className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-primary placeholder:text-muted/60 py-2.5"
                  />

                  <button 
                    type="submit"
                    disabled={(!inputText.trim() && !stt.transcript) || isLoading}
                    className="p-3 bg-accent text-background rounded-xl disabled:opacity-40 disabled:grayscale hover:brightness-110 transition-all shadow-lg shadow-accent/20"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </form>
              <div className="mt-4 flex items-center justify-between px-1">
                 <p className="text-[10px] text-muted font-medium tracking-wide uppercase">Powered by GemCode Engine</p>
                 <button onClick={onOpenSettings} className="text-muted hover:text-accent p-1 transition-colors">
                    <Settings className="w-3.5 h-3.5" />
                 </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
