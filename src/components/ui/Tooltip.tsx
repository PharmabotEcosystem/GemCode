import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

export function Tooltip({ content }: { content: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative inline-block ml-1.5">
      <HelpCircle
        className="w-3 h-3 text-muted cursor-help hover:text-accent transition-colors"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
      />
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2.5 bg-surface border border-border rounded-xl shadow-2xl z-[60] pointer-events-none"
          >
            <p className="text-[10px] text-secondary leading-normal font-medium">{content}</p>
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-surface" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
