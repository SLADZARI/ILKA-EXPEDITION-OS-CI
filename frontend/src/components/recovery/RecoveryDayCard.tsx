import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { CardShell } from '../cards/CardShell';
import { StatusBadge } from '../primitives/StatusBadge';

export function RecoveryDayCard({ available, localDate }: { available: boolean; localDate: string }) {
  return <CardShell id={COMPONENT_IDS.recovery_day_card} state={available ? 'available' : 'unavailable'} className="ilka-recovery-card">
    <p className="ilka-eyebrow">FLOATING RECOVERY DAY</p><h2>{available ? 'Доступен для активации' : 'Недоступен'}</h2>
    <p className="ilka-card-caption">Target local date: {localDate}. Активация не изменяет прошлые события и требует server confirmation.</p>
    <StatusBadge label={available ? 'Captain control enabled' : 'Control disabled'} tone={available ? 'success' : 'warning'} />
  </CardShell>;
}
