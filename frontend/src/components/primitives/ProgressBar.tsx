import { COMPONENT_IDS } from '../../design-system/generated/component-ids';

export function ProgressBar({ value, max = 100, label }: { value: number; max?: number; label?: string }) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, Math.round((value / safeMax) * 100)));
  return (
    <div className="ilka-progress" data-ui-id={COMPONENT_IDS.progress_bar} role="progressbar"
      aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      {label && <div className="ilka-progress__meta"><span>{label}</span><strong>{value}/{max}</strong></div>}
      <div className="ilka-progress__track"><div className="ilka-progress__fill" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
