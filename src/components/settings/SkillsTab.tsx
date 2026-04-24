import React, { useState } from 'react';
import { Book, Plus, Upload, ChevronRight } from 'lucide-react';
import type { AppSettings, Skill } from '../../types';
import { SettingsSection } from '../ui/SettingsSection';
import { SkillDetailPopup } from '../ui/SkillDetailPopup';

interface Props {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export function SkillsTab({ settings, setSettings }: Props) {
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);

  const addSkill = () => {
    const newSkill: Skill = {
      id: `custom-${Date.now()}`, name: 'Nuova Skill', description: '',
      systemPrompt: '', tools: [], enabled: false, category: 'custom',
    };
    setSettings(s => ({ ...s, skills: [...s.skills, newSkill] }));
    setEditingSkill(newSkill);
  };

  const importSkill = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const imported: Skill = { ...data, id: `imp-${Date.now()}`, category: 'import', enabled: true };
      setSettings(s => ({ ...s, skills: [...s.skills, imported] }));
    } catch { /* ignore invalid JSON */ }
  };

  const saveSkill = (updated: Skill) => {
    setSettings(s => ({ ...s, skills: s.skills.map(sk => sk.id === updated.id ? updated : sk) }));
    setEditingSkill(null);
  };

  const deleteSkill = (id: string) => {
    setSettings(s => ({ ...s, skills: s.skills.filter(sk => sk.id !== id) }));
    setEditingSkill(null);
  };

  const catColors: Record<string, string> = {
    system: 'bg-blue-500/10 text-blue-400', custom: 'bg-purple-500/10 text-purple-400', import: 'bg-emerald-500/10 text-emerald-400',
  };

  return (
    <div className="space-y-8">
      <SettingsSection icon={<Book className="w-5 h-5 text-blue-400" />} title="Competenze (Skills)" description="Abilità modulari che estendono le capacità dell'agente.">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted leading-tight pr-4">Seleziona quali abilità l'agente può caricare in memoria. Clicca una skill per modificarla.</p>
            <div className="flex gap-2">
              <button onClick={addSkill} className="p-1.5 rounded-lg border border-border text-accent hover:bg-accent/10 transition-colors" title="Crea nuova skill">
                <Plus className="w-4 h-4" />
              </button>
              <label className="p-1.5 rounded-lg border border-border text-accent hover:bg-accent/10 cursor-pointer transition-colors" title="Importa skill da JSON">
                <Upload className="w-4 h-4" />
                <input type="file" accept=".json" className="hidden" onChange={e => { if (e.target.files?.[0]) importSkill(e.target.files[0]); e.target.value = ''; }} />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {settings.skills.map(skill => (
              <button key={skill.id} onClick={() => setEditingSkill(skill)}
                className="w-full text-left rounded-xl border border-border bg-elevated/30 p-3 flex items-center gap-3 hover:bg-elevated/50 hover:border-accent/30 transition-all group">
                <input type="checkbox" checked={skill.enabled}
                  onClick={e => e.stopPropagation()}
                  onChange={e => setSettings(s => ({ ...s, skills: s.skills.map(sk => sk.id === skill.id ? { ...sk, enabled: e.target.checked } : sk) }))}
                  className="mt-0.5 w-4 h-4 accent-accent shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-primary">{skill.name}</p>
                    <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full ${catColors[skill.category] ?? ''}`}>{skill.category}</span>
                  </div>
                  <p className="text-[11px] text-muted line-clamp-1">{skill.description || 'Nessuna descrizione'}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted group-hover:text-accent transition-colors shrink-0" />
              </button>
            ))}
            {settings.skills.length === 0 && (
              <p className="text-xs text-muted text-center py-4">Nessuna skill configurata. Crea o importa la tua prima skill.</p>
            )}
          </div>
        </div>
      </SettingsSection>

      {editingSkill && (
        <SkillDetailPopup skill={editingSkill} onSave={saveSkill} onDelete={() => deleteSkill(editingSkill.id)} onClose={() => setEditingSkill(null)} />
      )}
    </div>
  );
}
