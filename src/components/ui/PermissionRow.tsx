import React from 'react';
import type { PermissionDescriptor, PermissionPolicy } from '../../types';

export function PermissionRow({ descriptor, value, onChange }: {
  descriptor: PermissionDescriptor; value: PermissionPolicy; onChange: (v: PermissionPolicy) => void; key?: React.Key;
}) {
  const riskColor = descriptor.risk === 'high' ? 'text-red-400' : descriptor.risk === 'medium' ? 'text-amber-400' : 'text-green-400';
  const riskLabel = descriptor.risk === 'high' ? 'ALTO' : descriptor.risk === 'medium' ? 'MEDIO' : 'BASSO';
  const badgeClass = descriptor.risk === 'high' ? 'border-red-500/30 bg-red-500/10 text-red-400'
    : descriptor.risk === 'medium' ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
    : 'border-green-500/30 bg-green-500/10 text-green-400';

  const btnClass = (policy: PermissionPolicy, active: string) =>
    `flex-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
      value === policy ? active : 'border border-border text-muted hover:text-secondary hover:bg-elevated'
    }`;

  return (
    <div className="rounded-xl border border-border bg-elevated/30 px-3 py-2.5 space-y-2">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${riskColor}`}>{descriptor.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-primary">{descriptor.label}</p>
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${badgeClass}`}>{riskLabel}</span>
          </div>
          <p className="text-[11px] text-muted leading-snug mt-0.5">{descriptor.description}</p>
        </div>
      </div>
      <div className="flex gap-1.5">
        <button onClick={() => onChange('allow')} className={btnClass('allow', 'bg-green-500/20 border border-green-500/40 text-green-400 shadow-sm shadow-green-500/10')}>Accetta</button>
        <button onClick={() => onChange('ask')} className={btnClass('ask', 'bg-amber-500/20 border border-amber-500/40 text-amber-400 shadow-sm shadow-amber-500/10')}>Chiedi</button>
        <button onClick={() => onChange('deny')} className={btnClass('deny', 'bg-red-500/20 border border-red-500/40 text-red-400 shadow-sm shadow-red-500/10')}>Nega</button>
      </div>
    </div>
  );
}
