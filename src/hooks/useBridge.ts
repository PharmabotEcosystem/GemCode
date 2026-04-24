import { useState, useEffect, useCallback } from 'react';
import type { Reachability, VoiceBridgeSettings, VoiceDeviceStatus, BridgeHealthSnapshot } from '../types';
import { DEFAULT_VOICE_BRIDGE_SETTINGS } from '../constants';
import { checkBridgeStatus, fetchBridgeSettings, fetchVoiceDeviceStatus, fetchBridgeHealth, saveBridgeSettings, toChatEndpoint } from '../api';
import type { AppSettings } from '../types';

export function useBridge(settings: AppSettings) {
  const [voiceBridgeStatus, setVoiceBridgeStatus] = useState<Reachability>('checking');
  const [voiceBridgeSettings, setVoiceBridgeSettings] = useState<VoiceBridgeSettings>(DEFAULT_VOICE_BRIDGE_SETTINGS);
  const [voiceDeviceStatus, setVoiceDeviceStatus] = useState<VoiceDeviceStatus | null>(null);
  const [bridgeHealth, setBridgeHealth] = useState<BridgeHealthSnapshot | null>(null);
  const [voiceSettingsDirty, setVoiceSettingsDirty] = useState(false);
  const [voiceSettingsMessage, setVoiceSettingsMessage] = useState<string | null>(null);
  const [isSavingVoiceSettings, setIsSavingVoiceSettings] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const st = await checkBridgeStatus(settings.bridgeUrl);
      if (cancelled) return;
      setVoiceBridgeStatus(st);
      if (st !== 'online') { setVoiceDeviceStatus(null); setBridgeHealth(null); return; }
      try {
        const [cfg, dev, hp] = await Promise.all([
          fetchBridgeSettings(settings.bridgeUrl),
          fetchVoiceDeviceStatus(settings.bridgeUrl, settings.voiceDeviceId),
          fetchBridgeHealth(settings.bridgeUrl),
        ]);
        if (cancelled) return;
        if (!voiceSettingsDirty) setVoiceBridgeSettings(cfg);
        setVoiceDeviceStatus(dev);
        setBridgeHealth(hp);
      } catch { if (!cancelled) { setVoiceBridgeStatus('offline'); setBridgeHealth(null); } }
    }
    refresh();
    const id = setInterval(refresh, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [settings.bridgeUrl, settings.voiceDeviceId, voiceSettingsDirty]);

  const updateVoiceBridgeSettings = <K extends keyof VoiceBridgeSettings>(key: K, value: VoiceBridgeSettings[K]) => {
    setVoiceBridgeSettings(prev => ({ ...prev, [key]: value }));
    setVoiceSettingsDirty(true);
    setVoiceSettingsMessage(null);
  };

  const reloadVoiceBridgeSettings = useCallback(async () => {
    setVoiceSettingsMessage(null);
    try {
      const [cfg, dev, hp] = await Promise.all([
        fetchBridgeSettings(settings.bridgeUrl),
        fetchVoiceDeviceStatus(settings.bridgeUrl, settings.voiceDeviceId),
        fetchBridgeHealth(settings.bridgeUrl),
      ]);
      setVoiceBridgeSettings(cfg); setVoiceDeviceStatus(dev); setBridgeHealth(hp);
      setVoiceSettingsDirty(false);
      setVoiceSettingsMessage('Impostazioni ricaricate dal bridge');
    } catch (e) {
      setVoiceSettingsMessage(`Ricarica fallita: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [settings.bridgeUrl, settings.voiceDeviceId]);

  const saveUnifiedPortalConfig = useCallback(async (currentSettings: AppSettings) => {
    setIsSavingVoiceSettings(true); setVoiceSettingsMessage(null);
    try {
      const updated = await saveBridgeSettings(currentSettings.bridgeUrl, {
        ...voiceBridgeSettings,
        agent_url: toChatEndpoint(currentSettings.ollamaHost),
        model: currentSettings.ollamaModel,
        system_prompt: currentSettings.systemPrompt,
        temperature: currentSettings.temperature,
        device_id: currentSettings.voiceDeviceId,
      });
      setVoiceBridgeSettings(updated); setVoiceSettingsDirty(false);
      setVoiceSettingsMessage('Profilo condiviso sincronizzato');
    } catch (e) {
      setVoiceSettingsMessage(`Sincronizzazione fallita: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setIsSavingVoiceSettings(false); }
  }, [voiceBridgeSettings]);

  const saveVoiceBridgeConfig = useCallback(async () => {
    setIsSavingVoiceSettings(true); setVoiceSettingsMessage(null);
    try {
      const updated = await saveBridgeSettings(settings.bridgeUrl, voiceBridgeSettings);
      setVoiceBridgeSettings(updated); setVoiceSettingsDirty(false);
      setVoiceSettingsMessage('Impostazioni bridge salvate');
    } catch (e) {
      setVoiceSettingsMessage(`Salvataggio fallito: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setIsSavingVoiceSettings(false); }
  }, [settings.bridgeUrl, voiceBridgeSettings]);

  return {
    voiceBridgeStatus, voiceBridgeSettings, voiceDeviceStatus, bridgeHealth,
    voiceSettingsDirty, voiceSettingsMessage, isSavingVoiceSettings,
    updateVoiceBridgeSettings, reloadVoiceBridgeSettings,
    saveUnifiedPortalConfig, saveVoiceBridgeConfig,
    setVoiceBridgeSettings, setVoiceSettingsMessage,
  };
}
