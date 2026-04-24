export function StatusBadge({ status, label }: { status: 'ok' | 'error' | 'checking'; label: string }) {
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${
      status === 'ok' ? 'bg-green-500/15 text-green-400'
        : status === 'error' ? 'bg-red-500/15 text-red-400'
        : 'bg-yellow-500/15 text-yellow-400'
    }`}>
      {label}
    </span>
  );
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-xs text-muted shrink-0">{label}</span>
      <span className="text-xs text-secondary text-right truncate max-w-[60%]">{value}</span>
    </div>
  );
}

export function BackendStatusDot({ ollamaStatus }: { ollamaStatus: 'online' | 'offline' | 'checking' }) {
  return (
    <span className={`w-2 h-2 rounded-full shrink-0 ${
      ollamaStatus === 'checking' ? 'bg-yellow-400/60 animate-pulse'
        : ollamaStatus === 'online' ? 'bg-green-400' : 'bg-red-400'
    }`} />
  );
}
