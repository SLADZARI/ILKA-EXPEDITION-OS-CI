import type { CaptainDayView } from '../../contracts/generated/captain-day-view';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { CardShell } from '../cards/CardShell';
import { StatusBadge } from '../primitives/StatusBadge';

type Stage = CaptainDayView['stage'];
export function StageCard({ stage }: { stage: Stage }) {
  return <CardShell id={COMPONENT_IDS.stage_card} state={stage.status}>
    <div className="ilka-card-heading"><div><p className="ilka-eyebrow">PRODUCT STAGE</p><h3>{stage.stage_id}</h3></div>
      <StatusBadge label={stage.status} tone={stage.status === 'completed' ? 'success' : stage.status === 'active' ? 'info' : 'neutral'} />
    </div>
    <p className="ilka-card-caption">Next: {stage.next_stage_id ?? 'final stage'}</p>
    <div className="ilka-badge-row">
      <StatusBadge label={`Advance: ${stage.advance_request_status}`} tone={stage.advance_request_status === 'conflict' || stage.advance_request_status === 'rejected' ? 'critical' : stage.advance_request_status === 'pending' ? 'warning' : 'neutral'} />
      <StatusBadge label={stage.can_advance ? 'Can advance' : 'Blocked'} tone={stage.can_advance ? 'success' : 'warning'} />
    </div>
  </CardShell>;
}
