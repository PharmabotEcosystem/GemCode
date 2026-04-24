import React, { useState } from 'react';
import { Sparkles, Copy, Check, Volume2, VolumeX } from 'lucide-react';
import { motion } from 'motion/react';
import type { Message } from '../types';

interface Props {
  message: Message;
  onSpeak?: (text: string) => void;
  onStopSpeaking?: () => void;
  isSpeaking?: boolean;
  key?: React.Key;
}

export function MessageBubble({ message, onSpeak, onStopSpeaking, isSpeaking }: Props) {
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
        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser ? 'bg-accent/15 border border-accent/20 text-primary rounded-tr-sm' : 'text-primary rounded-tl-sm'
        }`}>
          {message.text}
          {message.isStreaming && <span className="inline-block w-2 h-4 ml-0.5 bg-accent/70 rounded-sm animate-pulse align-middle" />}
        </div>
        {!message.isStreaming && message.text && (
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all">
            <button onClick={copy} className="flex items-center gap-1 text-xs text-muted hover:text-secondary px-1.5 py-0.5 rounded-md">
              {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copiato' : 'Copia'}
            </button>
            {!isUser && onSpeak && (
              <button
                onClick={() => isSpeaking ? onStopSpeaking?.() : onSpeak(message.text)}
                className="flex items-center gap-1 text-xs text-muted hover:text-accent px-1.5 py-0.5 rounded-md transition-colors"
                title={isSpeaking ? 'Ferma lettura' : 'Ascolta risposta'}
              >
                {isSpeaking ? <VolumeX className="w-3 h-3 text-accent" /> : <Volume2 className="w-3 h-3" />}
                {isSpeaking ? 'Stop' : 'Ascolta'}
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
