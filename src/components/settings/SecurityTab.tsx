import React from 'react';
import { ShieldCheck, Check, Eye, Lock } from 'lucide-react';
import type { AppSettings, AgentPermissions } from '../../types';
import { PERMISSION_DESCRIPTORS, DEFAULT_PERMISSIONS } from '../../constants';
import { SettingsSection } from '../ui/SettingsSection';
import { PermissionRow } from '../ui/PermissionRow';

interface Props {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export function SecurityTab({ settings, setSettings }: Props) {
  const setAll = (policy: 'allow' | 'ask' | 'deny') => {
    setSettings(s => ({
      ...s,
      agentPermissions: Object.fromEntries(Object.keys(s.agentPermissions).map(k => [k, policy])) as unknown as AgentPermissions,
    }));
  };

  return (
    <div className="space-y-8">
      <SettingsSection icon={<ShieldCheck className="w-5 h-5 text-red-400" />} title="Sicurezza" description="Permessi granulari per le azioni dell'agente.">
        <p className="text-xs text-muted mb-3">Controlla cosa l'agente può fare autonomamente. "Chiedi" mostrerà una conferma prima di ogni azione.</p>

        <div className="space-y-2">
          {PERMISSION_DESCRIPTORS.map(p => (
            <PermissionRow key={p.key} descriptor={p} value={settings.agentPermissions[p.key]}
              onChange={v => setSettings(s => ({ ...s, agentPermissions: { ...s.agentPermissions, [p.key]: v } }))} />
          ))}
        </div>

        <div className="flex gap-2 pt-3">
          <button onClick={() => setAll('allow')} className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-green-500/30 text-xs text-green-400 hover:bg-green-500/10 transition-colors">
            <Check className="w-3.5 h-3.5" />Accetta tutti
          </button>
          <button onClick={() => setAll('ask')} className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-amber-500/30 text-xs text-amber-400 hover:bg-amber-500/10 transition-colors">
            <Eye className="w-3.5 h-3.5" />Chiedi tutti
          </button>
          <button onClick={() => setAll('deny')} className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-red-500/30 text-xs text-red-400 hover:bg-red-500/10 transition-colors">
            <Lock className="w-3.5 h-3.5" />Nega tutti
          </button>
        </div>
        <button onClick={() => setSettings(s => ({ ...s, agentPermissions: DEFAULT_PERMISSIONS }))}
          className="w-full mt-2 px-3 py-2 rounded-xl border border-border text-xs text-secondary hover:bg-elevated hover:text-primary transition-colors">
          Ripristina predefiniti sicuri
        </button>
      </SettingsSection>
    </div>
  );
}
