import React from 'react';
import { Volume2, Mic, Radio } from 'lucide-react';
import type { AppSettings, VoiceBridgeSettings, VoiceDeviceStatus, BridgeHealthSnapshot, Reachability } from '../../types';
import { TTS_PROVIDER_OPTIONS, TTS_VOICE_OPTIONS } from '../../constants';
import { SettingsSection, SettingsSubsection } from '../ui/SettingsSection';
import { TextField, NumberField } from '../ui/FormFields';
import { Tooltip } from '../ui/Tooltip';
import { StatusBadge, InfoRow } from '../ui/StatusBadge';

function rgbToHex(rgb: number[] | undefined): string {
  if (!rgb || rgb.length < 3) return '#000000';
  return '#' + rgb.map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

function hexToRgb(hex: string): number[] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [0, 0, 0];
}

const LED_PRESETS = [
  { label: 'Idle', key: 'led_idle_color' as const },
  { label: 'Ascolto', key: 'led_listening_color' as const },
  { label: 'Elaborazione', key: 'led_thinking_color' as const },
  { label: 'Risposta', key: 'led_speaking_color' as const },
  { label: 'Errore', key: 'led_error_color' as const }
];

interface Props {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  voiceBridgeStatus: Reachability;
  voiceBridgeSettings: VoiceBridgeSettings;
  voiceDeviceStatus: VoiceDeviceStatus | null;
  bridgeHealth: BridgeHealthSnapshot | null;
  updateVoiceBridgeSettings: <K extends keyof VoiceBridgeSettings>(key: K, val: VoiceBridgeSettings[K]) => void;
  voiceSettingsMessage: string | null;
}

export function VoiceTab({ settings, setSettings, voiceBridgeStatus, voiceBridgeSettings, voiceDeviceStatus, bridgeHealth, updateVoiceBridgeSettings, voiceSettingsMessage }: Props) {
  const availableTtsVoices = TTS_VOICE_OPTIONS.filter(o => o.provider === voiceBridgeSettings.tts_provider);

  const testLed = async (r: number, g: number, b: number, brightness: number, effect: string = "solid") => {
    try {
      await fetch(`${settings.bridgeUrl}/api/device/led`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: voiceBridgeSettings.device_id,
          r, g, b, brightness, effect
        })
      });
    } catch (e) {
      console.error("Test LED fallito", e);
    }
  };

  return (
    <div className="space-y-8">
      {/* Output Settings */}
      <SettingsSection icon={<Volume2 className="w-5 h-5 text-purple-400" />} title="Voce e Multimedia" description="Output audio e configurazione del bridge vocale.">
        <SettingsSubsection title="Output Vocale" icon={<Mic className="w-3.5 h-3.5" />}>
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted">Parlato Automatico</label>
              <Tooltip content="Se attivo, l'agente leggerà ad alta voce ogni risposta." />
            </div>
            <input type="checkbox" checked={settings.autoSpeak}
              onChange={e => setSettings(s => ({ ...s, autoSpeak: e.target.checked }))} className="w-4 h-4 accent-accent" />
          </div>
          <div>
            <div className="flex items-center mb-1.5">
              <label className="text-xs text-muted">Modalità TTS</label>
              <Tooltip content="'Browser' usa la sintesi vocale del browser. 'Bridge' invia al bridge voce." />
            </div>
            <select value={settings.ttsMode} onChange={e => setSettings(s => ({ ...s, ttsMode: e.target.value as 'browser' | 'bridge' }))}
              className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-primary">
              <option value="browser">Browser (SpeechSynthesis)</option>
              <option value="bridge">Bridge voce</option>
            </select>
          </div>
          <TextField label="Endpoint Bridge" value={settings.bridgeUrl}
            onChange={v => setSettings(s => ({ ...s, bridgeUrl: v }))} help="URL del Voice Bridge locale." />
        </SettingsSubsection>

        <SettingsSubsection title="Dispositivi Audio" icon={<Radio className="w-3.5 h-3.5" />}>
          <div>
            <label className="text-xs text-muted mb-1.5 block">Device selezionato</label>
            <select value={settings.voiceDeviceId} onChange={e => setSettings(s => ({ ...s, voiceDeviceId: e.target.value }))}
              className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-xs text-secondary">
              <option value="box3">Cucina (Box 3)</option>
              <option value="pc-local">PC Locale</option>
              {bridgeHealth?.devices?.filter(d => d.device_id !== 'box3' && d.device_id !== 'pc-local').map(d => (
                <option key={d.device_id} value={d.device_id}>{d.device_name} ({d.device_id})</option>
              ))}
            </select>
          </div>
          {/* Device status card */}
          {voiceDeviceStatus && (
            <div className="rounded-2xl border border-border bg-elevated/30 p-3 space-y-2 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-primary font-medium">{voiceDeviceStatus.device_name}</p>
                  <p className="text-xs text-muted">ID {voiceDeviceStatus.device_id}</p>
                </div>
                <StatusBadge status={voiceDeviceStatus.status === 'online' ? 'ok' : 'error'} label={voiceDeviceStatus.status} />
              </div>
              <InfoRow label="IP" value={voiceDeviceStatus.remote_ip || 'n/d'} />
              <InfoRow label="Firmware" value={voiceDeviceStatus.firmware_mode || 'n/d'} />
              <InfoRow label="Sessione" value={voiceDeviceStatus.voice_session_status || 'idle'} />
            </div>
          )}
        </SettingsSubsection>

        <SettingsSubsection title="Parametri Bridge Voce" icon={<Volume2 className="w-3.5 h-3.5" />}>
          <div className="flex items-center justify-between rounded-xl border border-border bg-elevated/40 px-3 py-3 text-sm">
            <div>
              <p className="text-primary font-medium">Stato bridge</p>
              <p className="text-xs text-muted">{settings.bridgeUrl}</p>
            </div>
            <StatusBadge status={voiceBridgeStatus === 'online' ? 'ok' : voiceBridgeStatus === 'offline' ? 'error' : 'checking'} label={voiceBridgeStatus} />
          </div>
          <NumberField label="Frasi massime risposta" value={voiceBridgeSettings.max_response_sentences}
            onChange={v => updateVoiceBridgeSettings('max_response_sentences', v)} min={1} max={4} />
          <NumberField label="Caratteri massimi risposta" value={voiceBridgeSettings.max_response_chars}
            onChange={v => updateVoiceBridgeSettings('max_response_chars', v)} min={80} max={500} />
          <div>
            <label className="text-xs text-muted mb-1.5 block">Provider TTS</label>
            <select value={voiceBridgeSettings.tts_provider}
              onChange={e => { const p = e.target.value; const v = TTS_VOICE_OPTIONS.find(o => o.provider === p)?.value ?? voiceBridgeSettings.tts_voice; updateVoiceBridgeSettings('tts_provider', p); updateVoiceBridgeSettings('tts_voice', v); }}
              className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-primary">
              {TTS_PROVIDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted mb-1.5 block">Voce TTS</label>
            <select value={voiceBridgeSettings.tts_voice}
              onChange={e => updateVoiceBridgeSettings('tts_voice', e.target.value)}
              className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-primary">
              {availableTtsVoices.length === 0 ? <option value={voiceBridgeSettings.tts_voice}>{voiceBridgeSettings.tts_voice}</option>
                : availableTtsVoices.map(o => <option key={`${o.provider}:${o.value}`} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <TextField label="Wake word" value={voiceBridgeSettings.wake_word_label}
            onChange={v => updateVoiceBridgeSettings('wake_word_label', v)} />

          {voiceSettingsMessage && (
            <div className="rounded-xl bg-accent/10 border border-accent/20 px-3 py-2 text-xs text-accent">{voiceSettingsMessage}</div>
          )}
        </SettingsSubsection>

        {/* LED Customization */}
        <SettingsSubsection title="Personalizzazione LED Dispositivo" icon={<Radio className="w-3.5 h-3.5" />}>
          <div className="space-y-4">
            <NumberField label="Luminosità Base (Idle)" value={voiceBridgeSettings.led_idle_brightness ?? 45}
              onChange={v => updateVoiceBridgeSettings('led_idle_brightness', v)} min={10} max={255} />
            
            <div className="space-y-3 pt-2">
              <label className="text-xs text-muted font-medium">Colori Stati Operativi</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {LED_PRESETS.map((preset) => (
                  <div key={preset.key} className="flex items-center justify-between p-2 rounded-xl bg-elevated/50 border border-border">
                    <span className="text-xs text-secondary">{preset.label}</span>
                    <div className="flex items-center gap-2">
                      <input 
                        type="color" 
                        value={rgbToHex(voiceBridgeSettings[preset.key] as number[])}
                        onChange={e => updateVoiceBridgeSettings(preset.key, hexToRgb(e.target.value))}
                        className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent p-0"
                      />
                      <button 
                        onClick={() => {
                          const rgb = voiceBridgeSettings[preset.key] as number[] || [0,0,0];
                          testLed(rgb[0], rgb[1], rgb[2], preset.key === 'led_idle_color' ? voiceBridgeSettings.led_idle_brightness : 75);
                        }}
                        className="text-[10px] px-2 py-1 bg-surface border border-border rounded-lg hover:bg-border/50 transition-colors"
                      >
                        Test
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="pt-2">
              <button 
                onClick={() => testLed(255, 255, 255, 100, "flash")}
                className="w-full px-3 py-2 text-xs font-medium bg-accent/10 text-accent rounded-xl border border-accent/20 hover:bg-accent/20 transition-colors"
              >
                Invia Flash di Test
              </button>
            </div>
          </div>
        </SettingsSubsection>
      </SettingsSection>

      {/* Bridge Health */}
      {bridgeHealth && (
        <SettingsSection icon={<Radio className="w-5 h-5 text-green-400" />} title="Health Bridge" description="Stato in tempo reale e log del bridge.">
          <div className="rounded-2xl border border-border bg-elevated/30 p-3 space-y-2 text-sm">
            <InfoRow label="Dispositivi noti" value={String(bridgeHealth.device_count)} />
            <InfoRow label="Sessioni attive" value={String(bridgeHealth.active_sessions)} />
            <InfoRow label="Sessioni errore" value={String(bridgeHealth.error_sessions)} />
            <InfoRow label="Ultimo heartbeat" value={bridgeHealth.latest_seen_iso || 'n/d'} />
            {bridgeHealth.latest_audio_url && (
              <div className="rounded-xl border border-border/70 bg-surface px-3 py-2 space-y-2">
                <p className="text-xs text-muted">Ultimo audio</p>
                <audio controls src={bridgeHealth.latest_audio_url} className="w-full" />
              </div>
            )}
            {bridgeHealth.latest_error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">{bridgeHealth.latest_error}</div>
            )}
          </div>
          {bridgeHealth.recent_logs.length > 0 && (
            <div className="rounded-xl border border-border/70 bg-surface p-2 max-h-48 overflow-auto">
              {bridgeHealth.recent_logs.slice().reverse().map((entry, i) => (
                <div key={`${entry.timestamp}-${i}`} className="rounded-lg px-2 py-1.5 text-xs border-b border-border/30 last:border-0">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted">{entry.timestamp}</span>
                    <span className={entry.level === 'ERROR' ? 'text-red-400 font-medium' : entry.level === 'WARNING' ? 'text-amber-300' : 'text-secondary'}>{entry.level}</span>
                  </div>
                  <p className="mt-0.5 text-secondary whitespace-pre-wrap">{entry.message}</p>
                </div>
              ))}
            </div>
          )}
        </SettingsSection>
      )}
    </div>
  );
}
