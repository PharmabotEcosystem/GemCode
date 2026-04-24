import { Tooltip } from './Tooltip';

export function TextField({ label, value, onChange, placeholder, help }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; help?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <label className="text-[11px] font-medium text-muted">{label}</label>
        {help && <Tooltip content={help} />}
      </div>
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-primary focus:border-accent/50 focus:outline-none transition-all"
        placeholder={placeholder} />
    </div>
  );
}

export function RangeField({ label, min, max, step, value, onChange, help }: {
  label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; help?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <label className="text-[11px] font-medium text-muted">{label}</label>
          {help && <Tooltip content={help} />}
        </div>
        <span className="text-[11px] font-mono font-bold text-accent">{value.toFixed(2)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))} className="w-full accent-accent" />
    </div>
  );
}

export function NumberField({ label, value, onChange, min, max, help }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; help?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <label className="text-[11px] font-medium text-muted">{label}</label>
        {help && <Tooltip content={help} />}
      </div>
      <input type="number" value={value} min={min} max={max}
        onChange={e => onChange(parseInt(e.target.value, 10) || 0)}
        className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-primary focus:border-accent/50 focus:outline-none transition-all" />
    </div>
  );
}
