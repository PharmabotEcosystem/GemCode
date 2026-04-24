import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

export function SettingsSection({ icon, title, description, children }: {
  icon: React.ReactNode; title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2.5 text-primary">
          <div className="p-1.5 rounded-lg bg-accent/10">{icon}</div>
          <h3 className="text-sm font-bold tracking-tight">{title}</h3>
        </div>
        {description && <p className="text-xs text-muted leading-relaxed pl-10">{description}</p>}
      </div>
      <div className="space-y-4 pl-10 border-l border-border/50 ml-5">{children}</div>
    </div>
  );
}

export function SettingsSubsection({ icon, title, children }: {
  icon: React.ReactNode; title: string; children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div className="space-y-3">
      <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between group">
        <div className="flex items-center gap-2 text-secondary group-hover:text-primary transition-colors">
          {icon}
          <h4 className="text-[11px] font-bold uppercase tracking-widest">{title}</h4>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-muted transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden space-y-3 pt-1"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
