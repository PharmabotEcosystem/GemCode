import { Plus, MessageSquare, Settings, Wifi, WifiOff, ChevronLeft } from 'lucide-react';
import { motion } from 'motion/react';
import type { Conversation, VoiceDeviceStatus } from '../types';
import { GemcodeLogo } from './ui/GemcodeLogo';
import { BackendStatusDot } from './ui/StatusBadge';

interface Props {
  conversations: Conversation[];
  onNewChat: () => void;
  onOpenSettings: () => void;
  ollamaStatus: 'online' | 'offline' | 'checking';
  activeBackendLabel: string;
  voiceDeviceStatus: VoiceDeviceStatus | null;
  voiceDeviceId: string;
  onClose: () => void;
}

export function Sidebar({ conversations, onNewChat, onOpenSettings, ollamaStatus, activeBackendLabel, voiceDeviceStatus, voiceDeviceId, onClose }: Props) {
  return (
    <motion.aside
      key="sidebar"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 260, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col bg-surface border-r border-border overflow-hidden shrink-0"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <GemcodeLogo />
          <span className="font-semibold text-primary text-base tracking-tight">GemCode</span>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-elevated transition-colors lg:hidden">
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      <div className="px-3 py-3">
        <button onClick={onNewChat} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-secondary hover:bg-elevated hover:text-primary transition-colors">
          <Plus className="w-4 h-4 shrink-0" />Nuova chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5">
        {conversations.length > 0 && <p className="px-3 py-2 text-xs font-medium text-muted uppercase tracking-wider">Recenti</p>}
        {conversations.map(conv => (
          <div key={conv.id} className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm text-secondary hover:bg-elevated/60 hover:text-primary cursor-default transition-colors">
            <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted" />
            <span className="truncate leading-snug">{conv.title}</span>
          </div>
        ))}
        {conversations.length === 0 && <p className="px-3 py-4 text-xs text-muted text-center">Le conversazioni appariranno qui</p>}
      </div>

      <div className="border-t border-border px-3 py-3 space-y-1.5">
        <div className="px-3 py-2 flex items-center gap-2 text-xs text-muted">
          <BackendStatusDot ollamaStatus={ollamaStatus} />
          <span className="truncate">{activeBackendLabel}</span>
        </div>
        <div className="px-3 py-2 flex items-center gap-2 text-xs text-muted">
          {voiceDeviceStatus?.status === 'online' ? <Wifi className="w-3.5 h-3.5 text-green-400 shrink-0" /> : <WifiOff className="w-3.5 h-3.5 text-red-400 shrink-0" />}
          <span className="truncate">{voiceDeviceStatus?.device_name ?? voiceDeviceId} · {voiceDeviceStatus?.status ?? 'sconosciuto'}</span>
        </div>
        <button onClick={onOpenSettings} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-secondary hover:bg-elevated hover:text-primary transition-colors">
          <Settings className="w-4 h-4 shrink-0" />Impostazioni
        </button>
      </div>
    </motion.aside>
  );
}
