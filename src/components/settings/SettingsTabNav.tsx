import React from 'react';
import { Cpu, Book, Volume2, ShieldCheck, FolderOpen, Info, UserCircle } from 'lucide-react';
import type { SettingsTab } from '../../types';

const TABS: { id: SettingsTab; icon: React.ReactNode; label: string }[] = [
  { id: 'ai', icon: <Cpu className="w-4 h-4" />, label: 'AI Core' },
  { id: 'avatar', icon: <UserCircle className="w-4 h-4" />, label: 'Avatar 3D' },
  { id: 'skills', icon: <Book className="w-4 h-4" />, label: 'Skills' },
  { id: 'voice', icon: <Volume2 className="w-4 h-4" />, label: 'Voce' },
  { id: 'security', icon: <ShieldCheck className="w-4 h-4" />, label: 'Sicurezza' },
  { id: 'workspace', icon: <FolderOpen className="w-4 h-4" />, label: 'Workspace' },
  { id: 'info', icon: <Info className="w-4 h-4" />, label: 'Info' },
];

export function SettingsTabNav({ activeTab, onTabChange }: { activeTab: SettingsTab; onTabChange: (t: SettingsTab) => void }) {
  return (
    <div className="flex gap-1 px-5 py-3 border-b border-border overflow-x-auto">
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
            activeTab === tab.id
              ? 'bg-accent/15 text-accent border border-accent/30'
              : 'text-secondary hover:text-primary hover:bg-elevated border border-transparent'
          }`}
        >
          {tab.icon}
          <span className="hidden sm:inline">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
