import type { CaptainDayView } from '../../contracts/generated/captain-day-view';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { StatusBadge } from '../primitives/StatusBadge';

type Participant = CaptainDayView['participants'][number];
export function ParticipantAssignmentRow({ participant }: { participant: Participant }) {
  return <article className="ilka-row ilka-row--assignment" data-ui-id={COMPONENT_IDS.participant_assignment_row}>
    <div className="ilka-row__body"><h3>{participant.participant_id}</h3><p>{participant.product_role_id} · {participant.onboard_role_id}</p></div>
    <div className="ilka-row__status">
      <StatusBadge label={participant.sync_status ?? 'synced'} tone={participant.sync_status === 'pending' ? 'warning' : participant.sync_status === 'conflict' || participant.sync_status === 'rejected' ? 'critical' : 'success'} />
      {participant.status === 'banned' && <StatusBadge label="Banned" tone="critical" />}
    </div>
  </article>;
}
