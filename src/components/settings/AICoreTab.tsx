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
            
          <RangeField label="Top-K" min={1} max={100} step={1}
            value={settings.topK ?? 40}
            onChange={v => setSettings(s => ({ ...s, topK: v }))}
            help="Limita le opzioni del modello ai K token più probabili (default 40)." />

          <RangeField label="Top-P" min={0.1} max={1.0} step={0.05}
            value={settings.topP ?? 0.9}
            onChange={v => setSettings(s => ({ ...s, topP: v }))}
            help="Filtra cumulativamente le probabilità dei token (default 0.9)." />

          <RangeField label="Penalità Ripetizione (Repeat Penalty)" min={1.0} max={2.0} step={0.05}
            value={settings.repeatPenalty ?? 1.1}
            onChange={v => setSettings(s => ({ ...s, repeatPenalty: v }))}
            help="Disincentiva la ripetizione delle stesse frasi (default 1.1)." />

          <RangeField label="Lunghezza Contesto (Num Ctx)" min={1024} max={32768} step={1024}
            value={settings.numCtx ?? 4096}
            onChange={v => setSettings(s => ({ ...s, numCtx: v }))}
            help="Dimensione della finestra di contesto in token (default 4096)." />

          <RangeField label="Limite Output (Num Predict)" min={128} max={8192} step={128}
            value={settings.numPredict ?? 1024}
            onChange={v => setSettings(s => ({ ...s, numPredict: v }))}
            help="Numero massimo di token che l'agente può generare in una risposta (default 1024)." />

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
