import type { TodayView } from '../../contracts/generated/today-view';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { ScreenHeader } from '../../components/primitives/ScreenHeader';
import { SectionHeader } from '../../components/primitives/SectionHeader';
import { ProductRoleCard } from '../../components/cards/ProductRoleCard';
import { OnboardRoleCard } from '../../components/cards/OnboardRoleCard';
import { CardHand } from '../../components/cards/CardHand';
import { ActionCard } from '../../components/cards/ActionCard';
import { OutputRow } from '../../components/outputs/OutputRow';
import { EmptyState } from '../../components/system/EmptyState';
import { GamificationSummarySection } from '../../components/participant/GamificationSummarySection';

export function TodayScreen({ data, onAcknowledgeCard, onStartTask, onCompleteTask }: {
  data: TodayView;
  onAcknowledgeCard?: (cardId: string) => void;
  onStartTask?: (taskId: string) => void;
  onCompleteTask?: (taskId: string) => void;
}) {
  const currentTasks = data.tasks.filter((task) => task.status !== 'overdue');
  const overdue = data.tasks.filter((task) => task.status === 'overdue');
  return <div data-ui-id={COMPONENT_IDS.screen_participant_today}>
    <ScreenHeader eyebrow={`${data.local_date} · Day ${data.day.number}`} title={data.stage.title} sync={data.sync_status} />
    <section className="ilka-role-grid" aria-label="Назначенные роли">
      {data.product_role && <ProductRoleCard assignment={data.product_role} />}
      {data.onboard_role && <OnboardRoleCard assignment={data.onboard_role} />}
    </section>
    {data.gamification && <GamificationSummarySection data={data.gamification} />}
    <section><SectionHeader title="Card Bundle" />
      {data.cards.length ? <CardHand cards={data.cards} onAcknowledge={onAcknowledgeCard} /> : <EmptyState title="Card Bundle ещё не опубликован" />}
    </section>
    <section><SectionHeader title="Текущие задачи" />
      <div className="ilka-card-grid">{currentTasks.map((task) => <ActionCard key={task.task_id} task={task}
        onStart={onStartTask ? () => onStartTask(task.task_id) : undefined}
        onComplete={onCompleteTask ? () => onCompleteTask(task.task_id) : undefined} />)}</div>
    </section>
    {overdue.length > 0 && <section><SectionHeader title="Overdue" />
      <div className="ilka-card-grid">{overdue.map((task) => <ActionCard key={task.task_id} task={task}
        onComplete={onCompleteTask ? () => onCompleteTask(task.task_id) : undefined} />)}</div>
    </section>}
    {data.outputs.length > 0 && <section><SectionHeader title="Результаты дня" /><div className="ilka-list">
      {data.outputs.map((output) => <OutputRow key={output.output_id} output={output} />)}
    </div></section>}
  </div>;
}
