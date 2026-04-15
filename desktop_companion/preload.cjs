const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gemcodeCompanion', {
  getSettings: () => ipcRenderer.invoke('companion:get-settings'),
  saveAppSettings: partial => ipcRenderer.invoke('companion:save-app-settings', partial),
  updateProfile: (profileId, partial) => ipcRenderer.invoke('companion:update-profile', profileId, partial),
  createProfile: seed => ipcRenderer.invoke('companion:create-profile', seed),
  duplicateProfile: profileId => ipcRenderer.invoke('companion:duplicate-profile', profileId),
  deleteProfile: profileId => ipcRenderer.invoke('companion:delete-profile', profileId),
  setActiveProfile: profileId => ipcRenderer.invoke('companion:set-active-profile', profileId),
  exportProfile: profileId => ipcRenderer.invoke('companion:export-profile', profileId),
  importProfile: () => ipcRenderer.invoke('companion:import-profile'),
  pickAvatarFile: kind => ipcRenderer.invoke('companion:pick-avatar-file', kind),
  pickAvatarRoot: () => ipcRenderer.invoke('companion:pick-avatar-root'),
  scanAvatarLibrary: rootPath => ipcRenderer.invoke('companion:scan-avatar-library', rootPath),
  listQuickVamAvatars: () => ipcRenderer.invoke('companion:list-quick-vam-avatars'),
  getVamAssetCatalog: () => ipcRenderer.invoke('companion:get-vam-asset-catalog'),
  resolveVamCharacterPackage: packagePath => ipcRenderer.invoke('companion:resolve-vam-character-package', packagePath),
  toFileUrl: filePath => ipcRenderer.invoke('companion:to-file-url', filePath),
  focusWidget: () => ipcRenderer.invoke('companion:focus-widget'),
  openStudio: () => ipcRenderer.invoke('companion:open-studio'),
  toggleClickThrough: enabled => ipcRenderer.invoke('companion:toggle-click-through', enabled),
  getCharacterData: sceneFilePath => ipcRenderer.invoke('companion:get-character-data', sceneFilePath),
  saveCharacterPreset: (name, presetData) => ipcRenderer.invoke('companion:save-character-preset', name, presetData),
  listCharacterPresets: () => ipcRenderer.invoke('companion:list-character-presets'),
  loadCharacterPreset: fileName => ipcRenderer.invoke('companion:load-character-preset', fileName),
  deleteCharacterPreset: fileName => ipcRenderer.invoke('companion:delete-character-preset', fileName),
  updateWidgetLiveState: payload => ipcRenderer.send('companion:update-widget-live-state', payload),
  onSettingsUpdated: callback => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('companion:settings-updated', handler);
    return () => ipcRenderer.removeListener('companion:settings-updated', handler);
  },
  onWidgetLiveState: callback => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('companion:widget-live-state', handler);
    return () => ipcRenderer.removeListener('companion:widget-live-state', handler);
  },
});