import React from 'react';
import { Info } from 'lucide-react';
import type { AppSettings, VoiceBridgeSettings, Reachability, VoiceDeviceStatus } from '../../types';
import { DEFAULT_SETTINGS, DEFAULT_VOICE_BRIDGE_SETTINGS } from '../../constants';
import { SettingsSection } from '../ui/SettingsSection';
import { InfoRow } from '../ui/StatusBadge';

interface Props {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  voiceBridgeStatus: Reachability;
  voiceDeviceStatus: VoiceDeviceStatus | null;
  setVoiceBridgeSettings: (s: VoiceBridgeSettings) => void;
}

export function InfoTab({ settings, setSettings, voiceBridgeStatus, voiceDeviceStatus, setVoiceBridgeSettings }: Props) {
  return (
    <div className="space-y-8">
      <SettingsSection icon={<Info className="w-5 h-5 text-muted" />} title="Informazioni" description="Dettagli del sistema e reset globale.">
        <div className="space-y-2 text-xs text-secondary">
          <InfoRow label="Portale web" value="http://localhost:3000" />
          <InfoRow label="Bridge voce" value={settings.bridgeUrl} />
          <InfoRow label="Stato bridge" value={voiceBridgeStatus} />
          <InfoRow label="Voice device" value={voiceDeviceStatus?.device_name ?? settings.voiceDeviceId} />
          <InfoRow label="Device status" value={voiceDeviceStatus?.status ?? 'sconosciuto'} />
          <InfoRow label="Modello attivo" value={settings.ollamaModel} />
          <InfoRow label="Cloud API" value="Nessuna" />
          <InfoRow label="Dati inviati" value="Solo locale" />
        </div>

        <button
          onClick={() => { setSettings(DEFAULT_SETTINGS); setVoiceBridgeSettings(DEFAULT_VOICE_BRIDGE_SETTINGS); }}
          className="w-full px-3 py-2.5 rounded-xl border border-border text-sm text-secondary hover:bg-elevated hover:text-primary transition-colors mt-4">
          Ripristina tutti i predefiniti
        </button>
      </SettingsSection>
    </div>
  );
}
