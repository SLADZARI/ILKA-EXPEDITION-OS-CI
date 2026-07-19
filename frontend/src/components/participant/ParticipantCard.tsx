import type { CaptainDayView } from '../../contracts/generated/captain-day-view';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { StatusBadge } from '../primitives/StatusBadge';
import { CardShell } from '../cards/CardShell';

type Participant = CaptainDayView['participants'][number];
export function ParticipantCard({ participant }: { participant: Participant }) {
  return <CardShell id={COMPONENT_IDS.participant_card} variant="compact" state={participant.status ?? 'active'}>
    <div className="ilka-card-heading"><div><p className="ilka-eyebrow">{participant.participant_id}</p><h3>{participant.product_role_id}</h3></div>
      <StatusBadge label={participant.status === 'banned' ? 'Banned' : participant.sync_status ?? 'synced'}
        tone={participant.status === 'banned' ? 'critical' : participant.sync_status === 'conflict' ? 'critical' : participant.sync_status === 'pending' ? 'warning' : 'success'} />
    </div>
    <p className="ilka-card-caption">Onboard: {participant.onboard_role_id}</p>
    <div className="ilka-badge-row">
      <StatusBadge label={participant.required_cards_acknowledged ? 'Cards acknowledged' : 'Cards pending'} tone={participant.required_cards_acknowledged ? 'success' : 'warning'} />
      <StatusBadge label={participant.required_tasks_terminal ? 'Tasks terminal' : `${participant.overdue_task_count ?? 0} overdue`} tone={participant.required_tasks_terminal ? 'success' : 'warning'} />
    </div>
  </CardShell>;
}
