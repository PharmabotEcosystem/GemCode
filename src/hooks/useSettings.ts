import { useState, useEffect } from 'react';
import type { AppSettings } from '../types';
import { STORAGE_KEY, DEFAULT_SETTINGS } from '../constants';

function loadStoredSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { return DEFAULT_SETTINGS; }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => { setSettings(loadStoredSettings()); }, []);
  useEffect(() => { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }, [settings]);

  const resetSettings = () => setSettings(DEFAULT_SETTINGS);
  return { settings, setSettings, resetSettings };
}
