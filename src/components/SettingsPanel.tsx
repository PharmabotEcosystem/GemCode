import React, { useState } from 'react';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import type { AppSettings, SettingsTab, ModelOption, VoiceBridgeSettings, VoiceDeviceStatus, BridgeHealthSnapshot, Reachability, ChatAttachment } from '../types';
import { SettingsTabNav } from './settings/SettingsTabNav';
import { AICoreTab } from './settings/AICoreTab';
import { AvatarTab } from './settings/AvatarTab';
import { SkillsTab } from './settings/SkillsTab';
import { VoiceTab } from './settings/VoiceTab';
import { SecurityTab } from './settings/SecurityTab';
import { WorkspaceTab } from './settings/WorkspaceTab';
import { InfoTab } from './settings/InfoTab';

interface Props {
  onClose: () => void;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  modelOptions: ModelOption[];
  voiceBridgeStatus: Reachability;
  voiceBridgeSettings: VoiceBridgeSettings;
  voiceDeviceStatus: VoiceDeviceStatus | null;
  bridgeHealth: BridgeHealthSnapshot | null;
  updateVoiceBridgeSettings: <K extends keyof VoiceBridgeSettings>(key: K, val: VoiceBridgeSettings[K]) => void;
  voiceSettingsMessage: string | null;
  setVoiceBridgeSettings: (s: VoiceBridgeSettings) => void;
  pendingAttachments: ChatAttachment[];
  setPendingAttachments: React.Dispatch<React.SetStateAction<ChatAttachment[]>>;
}

export function SettingsPanel({
  onClose, settings, setSettings, modelOptions,
  voiceBridgeStatus, voiceBridgeSettings, voiceDeviceStatus, bridgeHealth,
  updateVoiceBridgeSettings, voiceSettingsMessage, setVoiceBridgeSettings,
  pendingAttachments, setPendingAttachments,
}: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai');

  return (
    <>
      <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <motion.div key="panel"
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="fixed right-0 top-0 h-full w-[30rem] bg-surface border-l border-border z-50 flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="font-semibold text-primary">Impostazioni GemCode</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-secondary hover:bg-elevated hover:text-primary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Nav */}
        <SettingsTabNav activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-5 py-6">
          {activeTab === 'ai' && <AICoreTab settings={settings} setSettings={setSettings} modelOptions={modelOptions} />}
          {activeTab === 'avatar' && <AvatarTab settings={settings} setSettings={setSettings} />}
          {activeTab === 'skills' && <SkillsTab settings={settings} setSettings={setSettings} />}
          {activeTab === 'voice' && (
            <VoiceTab settings={settings} setSettings={setSettings}
              voiceBridgeStatus={voiceBridgeStatus} voiceBridgeSettings={voiceBridgeSettings}
              voiceDeviceStatus={voiceDeviceStatus} bridgeHealth={bridgeHealth}
              updateVoiceBridgeSettings={updateVoiceBridgeSettings} voiceSettingsMessage={voiceSettingsMessage} />
          )}
          {activeTab === 'security' && <SecurityTab settings={settings} setSettings={setSettings} />}
          {activeTab === 'workspace' && <WorkspaceTab settings={settings} pendingAttachments={pendingAttachments} setPendingAttachments={setPendingAttachments} />}
          {activeTab === 'info' && <InfoTab settings={settings} setSettings={setSettings}
            voiceBridgeStatus={voiceBridgeStatus} voiceDeviceStatus={voiceDeviceStatus}
            setVoiceBridgeSettings={setVoiceBridgeSettings} />}
        </div>
      </motion.div>
    </>
  );
}
