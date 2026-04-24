import { motion } from 'motion/react';
import { GemcodeLogo } from './ui/GemcodeLogo';
import { SUGGESTION_CHIPS } from '../constants';

export function WelcomeScreen({ onSuggestion }: { onSuggestion: (s: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-12 select-none">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center text-center max-w-xl"
      >
        <div className="mb-6"><GemcodeLogo size={48} /></div>
        <h1 className="text-3xl font-bold text-primary mb-2 tracking-tight">Ciao, come posso aiutarti?</h1>
        <p className="text-secondary text-base mb-10">AI locale · Chat web e bridge voce gestiti nello stesso pannello</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
          {SUGGESTION_CHIPS.map(chip => (
            <button key={chip} onClick={() => onSuggestion(chip)}
              className="text-left px-4 py-3.5 rounded-2xl border border-border bg-surface hover:bg-elevated hover:border-accent/40 transition-all text-sm text-secondary hover:text-primary leading-snug">
              {chip}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
