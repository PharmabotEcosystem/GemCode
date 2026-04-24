import React, { useState } from 'react';
import { Sparkles, Copy, Check, Volume2, VolumeX, Code } from 'lucide-react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/atom-one-dark.css'; // Modern dark theme for code
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

  // Helper to extract thinking tags for clean rendering if present
  let renderText = message.text;
  let thinkingText = '';
  const thinkMatch = renderText.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
  if (thinkMatch) {
    thinkingText = thinkMatch[1].trim();
    renderText = renderText.replace(/<think>[\s\S]*?(?:<\/think>|$)/, '').trim();
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} w-full`}
    >
      {!isUser && (
        <div className="shrink-0 mt-1 w-8 h-8 rounded-full bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/20 flex items-center justify-center shadow-[0_0_15px_rgba(var(--color-accent),0.1)]">
          <Sparkles className="w-4 h-4 text-accent" />
        </div>
      )}
      
      <div className={`group relative max-w-[85%] flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
        
        {/* Thinking Indicator */}
        {!isUser && thinkingText && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="px-4 py-2.5 rounded-2xl bg-surface/50 border border-border/50 text-xs text-muted/80 italic w-full border-l-2 border-l-accent/50"
          >
            <div className="flex items-center gap-2 mb-1 text-accent/80 font-medium not-italic">
              <Sparkles className="w-3 h-3" />
              L'agente sta elaborando...
            </div>
            {thinkingText}
          </motion.div>
        )}

        {/* Message Content */}
        <div className={`px-5 py-4 rounded-3xl text-[15px] leading-relaxed shadow-sm ${
          isUser 
            ? 'bg-accent/15 border border-accent/20 text-primary rounded-tr-sm' 
            : 'bg-surface border border-border/50 text-primary rounded-tl-sm w-full'
        }`}>
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">{renderText}</div>
          ) : (
            <div className="markdown-prose w-full">
              {renderText ? (
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]} 
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    p: ({children}) => <p className="mb-4 last:mb-0 leading-relaxed text-secondary">{children}</p>,
                    h1: ({children}) => <h1 className="text-2xl font-bold mt-6 mb-4 text-primary border-b border-border/50 pb-2">{children}</h1>,
                    h2: ({children}) => <h2 className="text-xl font-bold mt-5 mb-3 text-primary">{children}</h2>,
                    h3: ({children}) => <h3 className="text-lg font-semibold mt-4 mb-2 text-primary">{children}</h3>,
                    ul: ({children}) => <ul className="list-disc pl-5 mb-4 space-y-1.5 text-secondary">{children}</ul>,
                    ol: ({children}) => <ol className="list-decimal pl-5 mb-4 space-y-1.5 text-secondary">{children}</ol>,
                    li: ({children}) => <li className="pl-1">{children}</li>,
                    strong: ({children}) => <strong className="font-bold text-primary">{children}</strong>,
                    blockquote: ({children}) => <blockquote className="border-l-4 border-accent/40 pl-4 py-1 italic bg-accent/5 rounded-r-lg mb-4 text-secondary">{children}</blockquote>,
                    table: ({children}) => <div className="overflow-x-auto mb-4 rounded-xl border border-border/50"><table className="w-full text-sm text-left">{children}</table></div>,
                    thead: ({children}) => <thead className="bg-surface text-xs uppercase font-semibold text-muted border-b border-border/50">{children}</thead>,
                    tr: ({children}) => <tr className="border-b border-border/20 last:border-0 hover:bg-surface/30 transition-colors">{children}</tr>,
                    th: ({children}) => <th className="px-4 py-3 text-primary">{children}</th>,
                    td: ({children}) => <td className="px-4 py-3 text-secondary">{children}</td>,
                    a: ({href, children}) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline underline-offset-2">{children}</a>,
                    code(props) {
                      const {children, className, node, ...rest} = props;
                      const match = /language-(\w+)/.exec(className || '');
                      const isInline = !match && !className?.includes('hljs');
                      return isInline ? (
                        <code className="bg-elevated px-1.5 py-0.5 rounded-md text-sm font-mono text-accent/90 border border-border/50" {...rest}>{children}</code>
                      ) : (
                        <div className="relative my-4 rounded-xl overflow-hidden border border-border/50 shadow-sm group">
                          <div className="flex items-center justify-between px-4 py-2 bg-elevated/80 border-b border-border/50">
                            <div className="flex items-center gap-2">
                              <Code className="w-3.5 h-3.5 text-muted" />
                              <span className="text-xs font-mono text-muted uppercase tracking-wider">{match?.[1] || 'Code'}</span>
                            </div>
                            <button 
                              onClick={() => navigator.clipboard.writeText(String(children).replace(/\n$/, ''))}
                              className="text-xs flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface border border-border text-secondary hover:text-primary hover:border-accent/50 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Copy className="w-3 h-3" /> Copia
                            </button>
                          </div>
                          <div className="overflow-x-auto text-[13px] bg-[#282c34]">
                            <code className={className} {...rest}>
                              {children}
                            </code>
                          </div>
                        </div>
                      );
                    }
                  }}
                >
                  {renderText}
                </ReactMarkdown>
              ) : null}
            </div>
          )}
          
          {/* Typing Indicator */}
          {message.isStreaming && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-2 flex items-center gap-1.5"
            >
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-[11px] text-accent/70 ml-1 font-medium tracking-wide uppercase">Generazione...</span>
            </motion.div>
          )}
        </div>

        {/* Action Bar */}
        {!message.isStreaming && message.text && (
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 transition-all mt-1">
            <button onClick={copy} className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-secondary px-2.5 py-1 rounded-lg hover:bg-surface transition-colors">
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copiato' : 'Copia'}
            </button>
            {!isUser && onSpeak && (
              <button
                onClick={() => isSpeaking ? onStopSpeaking?.() : onSpeak(message.text)}
                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${
                  isSpeaking ? 'text-accent bg-accent/10' : 'text-muted hover:text-accent hover:bg-surface'
                }`}
                title={isSpeaking ? 'Ferma lettura' : 'Ascolta risposta'}
              >
                {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                {isSpeaking ? 'In riproduzione...' : 'Ascolta'}
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
