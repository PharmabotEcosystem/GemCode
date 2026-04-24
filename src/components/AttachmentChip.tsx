import React from 'react';
import { X } from 'lucide-react';
import type { ChatAttachment } from '../types';

export function AttachmentChip({ attachment, onRemove }: { attachment: ChatAttachment; onRemove: (id: string) => void; key?: React.Key }) {
  const tone = attachment.error ? 'border-amber-400/30 bg-amber-400/10 text-amber-100'
    : attachment.kind === 'image' ? 'border-blue-400/30 bg-blue-400/10 text-blue-100'
    : 'border-border bg-surface text-secondary';
  return (
    <div className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${tone}`}>
      <span className="truncate max-w-52">{attachment.name}</span>
      <span className="text-[10px] uppercase tracking-wide opacity-70">{attachment.kind}</span>
      <button onClick={() => onRemove(attachment.id)} className="rounded-full p-0.5 hover:bg-white/10 transition-colors" title={`Rimuovi ${attachment.name}`}>
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
