import type { TodayView } from '../../contracts/generated/today-view';
import type { QueuedCommand } from '../offline/OfflineCommandQueue';

export type ConnectivityState = 'online' | 'offline' | 'unknown';

type TodaySyncStatus = TodayView['sync_status'];

function appliesToToday(view: TodayView, item: QueuedCommand): boolean {
  const command = item.command;
  return command.expedition_id === view.expedition_id
    && command.actor_id === view.participant_id
    && command.day_number === view.day.number
    && command.stage_id === view.stage.stage_id;
}

function deriveSyncStatus(
  authoritative: TodaySyncStatus,
  commands: QueuedCommand[],
  connectivity: ConnectivityState,
): TodaySyncStatus {
  if (commands.some((item) => item.status === 'conflict')) return 'conflict';
  if (commands.some((item) => item.status === 'rejected')) return 'rejected';
  if (connectivity === 'offline') return 'offline';
  if (commands.some((item) => item.status === 'pending')) return 'pending';
  return authoritative;
}

export function applyParticipantCommandOverlay(
  authoritative: TodayView,
  queue: QueuedCommand[],
  connectivity: ConnectivityState = 'unknown',
): TodayView {
  const relevant = queue.filter((item) => appliesToToday(authoritative, item));
  const pending = relevant.filter((item) => item.status === 'pending');

  const pendingCardIds = new Set(
    pending
      .filter((item) => item.command.command_type === 'acknowledge_card')
      .map((item) => item.command.payload.card_id),
  );
  const pendingTaskIds = new Set(
    pending
      .filter((item) => ['start_task', 'block_task', 'complete_task'].includes(item.command.command_type))
      .map((item) => {
        const command = item.command;
        if (command.command_type === 'start_task' || command.command_type === 'block_task' || command.command_type === 'complete_task') {
          return command.payload.task_id;
        }
        return null;
      })
      .filter((taskId): taskId is string => Boolean(taskId)),
  );

  return {
    ...authoritative,
    sync_status: deriveSyncStatus(authoritative.sync_status, relevant, connectivity),
    cards: authoritative.cards.map((card) => pendingCardIds.has(card.card_id)
      ? { ...card, pending_sync: true }
      : card),
    tasks: authoritative.tasks.map((task) => pendingTaskIds.has(task.task_id)
      ? { ...task, pending_sync: true }
      : task),
  };
}
