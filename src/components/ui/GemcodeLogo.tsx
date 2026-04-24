import { Sparkles } from 'lucide-react';

export function GemcodeLogo({ size = 28 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-xl bg-gradient-to-br from-accent via-blue-500 to-accent-hover flex items-center justify-center shrink-0 shadow-sm"
    >
      <Sparkles style={{ width: size * 0.5, height: size * 0.5 }} className="text-white" />
    </div>
  );
}
