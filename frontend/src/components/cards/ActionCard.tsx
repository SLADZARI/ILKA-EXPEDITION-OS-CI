import type { TodayView } from '../../contracts/generated/today-view';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { TASK_STATUS_LABEL, TASK_STATUS_TONE } from '../../contracts/status-maps';
import { Button } from '../primitives/Button';
import { StatusBadge } from '../primitives/StatusBadge';
import { CardShell } from './CardShell';

type Task = TodayView['tasks'][number];
export function ActionCard({ task, onStart, onComplete }: { task: Task; onStart?: () => void; onComplete?: () => void }) {
  const canStart = task.status === 'available';
  const canComplete = task.status === 'in_progress' || task.status === 'blocked';
  return <CardShell id={COMPONENT_IDS.action_card} state={task.status}>
    <StatusBadge label={TASK_STATUS_LABEL[task.status]} tone={TASK_STATUS_TONE[task.status]} />
    <h3>{task.title}</h3>
    {task.due_day_number && <p className="ilka-card-caption">Срок: Day {task.due_day_number}</p>}
    {task.pending_sync && <StatusBadge label="Pending sync" tone="sync_pending" icon="clock" />}
    {(canStart || canComplete) && <div className="ilka-card-actions">
      {canStart && <Button onClick={onStart}>Начать</Button>}
      {canComplete && <Button onClick={onComplete}>Завершить</Button>}
    </div>}
  </CardShell>;
}
