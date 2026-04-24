import React from 'react';
import { Activity, SlidersHorizontal, Cpu } from 'lucide-react';
import type { AppSettings, ModelOption } from '../../types';
import { SettingsSection, SettingsSubsection } from '../ui/SettingsSection';
import { TextField, RangeField } from '../ui/FormFields';
import { Tooltip } from '../ui/Tooltip';

interface Props {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  modelOptions: ModelOption[];
}

export function AICoreTab({ settings, setSettings, modelOptions }: Props) {
  return (
    <div className="space-y-8">
      <SettingsSection icon={<Cpu className="w-5 h-5 text-accent" />} title="AI Core & LLM" description="Gestione del motore di intelligenza artificiale locale.">
        <SettingsSubsection title="Configurazione Ollama" icon={<Activity className="w-3.5 h-3.5" />}>
          <TextField label="Server URL" value={settings.ollamaHost}
            onChange={v => setSettings(s => ({ ...s, ollamaHost: v }))}
            help="L'indirizzo IP o l'host del server Ollama sul tuo sistema." />
          <div>
            <div className="flex items-center mb-1.5">
              <label className="text-xs text-muted">Modello Attivo</label>
              <Tooltip content="Scegli il modello da usare. 'gemma4' è consigliato per prestazioni bilanciate." />
            </div>
            <select value={settings.ollamaModel}
              onChange={e => setSettings(s => ({ ...s, ollamaModel: e.target.value }))}
              className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-primary">
              {modelOptions.length === 0
                ? <option value={settings.ollamaModel}>{settings.ollamaModel}</option>
                : modelOptions.map(m => <option key={m.name} value={m.name}>{m.name}{m.parameterSize ? ` (${m.parameterSize})` : ''}</option>)
              }
            </select>
          </div>
        </SettingsSubsection>

        <SettingsSubsection title="Parametri Generativi" icon={<SlidersHorizontal className="w-3.5 h-3.5" />}>
          <RangeField label="Creatività (Temperature)" min={0} max={1} step={0.05}
            value={settings.temperature}
            onChange={v => setSettings(s => ({ ...s, temperature: v }))}
            help="Valori bassi sono deterministici, valori alti più fantasiosi." />
          <div>
            <div className="flex items-center mb-1.5">
              <label className="text-xs text-muted font-medium">Istruzioni di Sistema</label>
              <Tooltip content="Definisce l'identità e i limiti dell'agente." />
            </div>
            <textarea value={settings.systemPrompt}
              onChange={e => setSettings(s => ({ ...s, systemPrompt: e.target.value }))}
              rows={4}
              className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-xs text-secondary leading-relaxed resize-none" />
          </div>
        </SettingsSubsection>
      </SettingsSection>
    </div>
  );
}
