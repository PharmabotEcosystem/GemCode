import React from 'react';
import { Plus, Copy } from 'lucide-react';
import type { ChatAttachment } from '../types';
import { formatBytes } from '../utils';
import { StatusBadge } from './ui/StatusBadge';

export function WorkspaceFileCard({ file, inChat, onAddToChat, onCopyText }: {
  file: ChatAttachment; inChat: boolean; onAddToChat: (id: string) => void; onCopyText: (id: string) => void; key?: React.Key;
}) {
  return (
    <div className="rounded-2xl border border-border bg-elevated/30 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary truncate">{file.name}</p>
          <p className="text-xs text-muted">{file.kind} · {formatBytes(file.size)}</p>
        </div>
        <StatusBadge status={file.error ? 'checking' : 'ok'} label={file.error ? 'limitato' : 'ok'} />
      </div>
      {file.imageDataUrl && <img src={file.imageDataUrl} alt={file.name} className="w-full max-h-40 object-contain rounded-xl border border-border bg-surface" />}
      <div className="rounded-xl border border-border/70 bg-surface px-3 py-2">
        <p className="text-xs text-muted mb-1">Anteprima</p>
        <p className="text-xs text-secondary whitespace-pre-wrap break-words line-clamp-6">{file.previewText || 'Nessuna anteprima disponibile.'}</p>
      </div>
      {file.error && <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-200">{file.error}</div>}
      <div className="flex gap-2">
        <button onClick={() => onAddToChat(file.id)} className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-border text-xs text-secondary hover:bg-elevated hover:text-primary transition-colors">
          <Plus className="w-3.5 h-3.5" />{inChat ? 'Gia in chat' : 'Aggiungi alla chat'}
        </button>
        <button onClick={() => onCopyText(file.id)} disabled={!file.extractedText} className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-border text-xs text-secondary hover:bg-elevated hover:text-primary disabled:opacity-30 transition-colors">
          <Copy className="w-3.5 h-3.5" />Copia testo
        </button>
      </div>
    </div>
  );
}
