import { useState } from 'react';
import { X, Save, Download, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { Skill } from '../../types';
import { triggerBlobDownload } from '../../utils';

interface Props {
  skill: Skill;
  onSave: (updated: Skill) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function SkillDetailPopup({ skill, onSave, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState<Skill>({ ...skill });

  const handleExport = () => {
    const { id, ...exportData } = draft;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    triggerBlobDownload(`${draft.name.replace(/\s+/g, '_').toLowerCase()}.json`, blob);
  };

  const catColors: Record<string, string> = {
    system: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    custom: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    import: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
          className="bg-surface border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-primary text-sm">Dettaglio Skill</h3>
              <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${catColors[draft.category] ?? catColors.custom}`}>
                {draft.category}
              </span>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-secondary hover:bg-elevated hover:text-primary transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted">Nome</label>
              <input type="text" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-primary focus:border-accent/50 focus:outline-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted">Descrizione</label>
              <input type="text" value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-primary focus:border-accent/50 focus:outline-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted">System Prompt</label>
              <textarea value={draft.systemPrompt} onChange={e => setDraft(d => ({ ...d, systemPrompt: e.target.value }))}
                rows={4} className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-xs text-secondary leading-relaxed resize-none focus:border-accent/50 focus:outline-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted">Tools (separati da virgola)</label>
              <input type="text" value={draft.tools.join(', ')} onChange={e => setDraft(d => ({ ...d, tools: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))}
                className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-primary focus:border-accent/50 focus:outline-none" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={draft.enabled} onChange={e => setDraft(d => ({ ...d, enabled: e.target.checked }))} className="w-4 h-4 accent-accent" />
              <span className="text-xs text-secondary">Attiva in sessione</span>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-elevated/30">
            <div className="flex gap-2">
              <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-secondary hover:text-primary hover:bg-elevated transition-colors">
                <Download className="w-3.5 h-3.5" /> Esporta JSON
              </button>
              {draft.category !== 'system' && (
                <button onClick={onDelete} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-xs text-red-400 hover:bg-red-500/10 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> Elimina
                </button>
              )}
            </div>
            <button onClick={() => onSave(draft)} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors">
              <Save className="w-3.5 h-3.5" /> Salva
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
