import { AlertCircle } from 'lucide-react';

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-2xl px-4 py-3">
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span className="whitespace-pre-wrap">{message}</span>
    </div>
  );
}
