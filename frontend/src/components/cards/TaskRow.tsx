import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import type { Task } from '../../contracts/status-maps';
import { TASK_STATUS_LABEL, TASK_STATUS_TONE } from '../../contracts/status-maps';
import { StatusBadge } from '../primitives/StatusBadge';
import { Icon } from '../primitives/Icon';

export function TaskRow({ task }: { task: Task }) {
  return (
    <article className="ilka-row" data-ui-id={COMPONENT_IDS.task_row} data-state={task.status}>
      <div className="ilka-row__icon"><Icon name={task.status === 'completed' ? 'check' : 'cards'} /></div>
      <div className="ilka-row__body"><h3>{task.title}</h3>{task.due_day_number && <p>Day {task.due_day_number}</p>}</div>
      <div className="ilka-row__status">
        <StatusBadge label={TASK_STATUS_LABEL[task.status]} tone={TASK_STATUS_TONE[task.status]} />
        {task.pending_sync && <StatusBadge label="Pending" tone="sync_pending" icon="clock" />}
      </div>
    </article>
  );
}
