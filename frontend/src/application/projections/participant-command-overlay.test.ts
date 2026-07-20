import { describe, expect, it } from 'vitest';
import { createAcknowledgeCardCommand, createCompleteTaskCommand, createStartTaskCommand } from '../commands/task';
import type { OfflineQueueableCommand, QueuedCommand, QueueStatus } from '../offline/OfflineCommandQueue';
import { todayViewFixture } from '../../dev/today-view.fixture';
import type { TodayView } from '../../contracts/generated/today-view';
import { applyParticipantCommandOverlay } from './participant-command-overlay';

const context = {
  actor_id: todayViewFixture.participant_id,
  actor_role: 'participant' as const,
  expedition_id: todayViewFixture.expedition_id,
  day_number: todayViewFixture.day.number,
  stage_id: todayViewFixture.stage.stage_id,
};

function authoritativeView(): TodayView {
  return {
    ...todayViewFixture,
    sync_status: 'synced',
    cards: todayViewFixture.cards.map((card) => ({ ...card, pending_sync: false })),
    tasks: todayViewFixture.tasks.map((task) => ({ ...task, pending_sync: false })),
  };
}

function queued(command: OfflineQueueableCommand, status: QueueStatus = 'pending'): QueuedCommand {
  return {
    local_id: `local_${command.command_id}`,
    command,
    status,
    attempts: status === 'pending' ? 0 : 1,
    created_at: '2026-07-20T12:00:00.000Z',
    last_error: status === 'conflict'
      ? { code: 'revision_conflict', message: 'Projection changed', retryable: true }
      : status === 'rejected'
        ? { code: 'permission_denied', message: 'Command rejected', retryable: false }
        : null,
  };
}

describe('applyParticipantCommandOverlay', () => {
  it('marks a card pending without claiming that it was acknowledged', () => {
    const command = createAcknowledgeCardCommand('knowledge_decision_flow', context);

    const result = applyParticipantCommandOverlay(authoritativeView(), [queued(command)], 'online');
    const card = result.cards.find((item) => item.card_id === 'knowledge_decision_flow');

    expect(result.sync_status).toBe('pending');
    expect(card?.pending_sync).toBe(true);
    expect(card?.acknowledged).toBe(false);
  });

  it('marks a task pending without changing its authoritative status', () => {
    const command = createCompleteTaskCommand('task_facilitate_session', context);

    const result = applyParticipantCommandOverlay(authoritativeView(), [queued(command)], 'online');
    const task = result.tasks.find((item) => item.task_id === 'task_facilitate_session');

    expect(task?.pending_sync).toBe(true);
    expect(task?.status).toBe('in_progress');
  });

  it('ignores commands from another participant, day or stage', () => {
    const otherParticipant = createStartTaskCommand('task_facilitate_session', { ...context, actor_id: 'participant_99' });
    const otherDay = createStartTaskCommand('task_facilitate_session', { ...context, day_number: context.day_number + 1 });
    const otherStage = createStartTaskCommand('task_facilitate_session', { ...context, stage_id: 'mvp_scope' });

    const result = applyParticipantCommandOverlay(
      authoritativeView(),
      [queued(otherParticipant), queued(otherDay), queued(otherStage)],
      'online',
    );

    expect(result.sync_status).toBe('synced');
    expect(result.tasks.every((task) => !task.pending_sync)).toBe(true);
  });

  it('uses conflict, rejected, offline and pending display precedence', () => {
    const pending = queued(createStartTaskCommand('task_facilitate_session', context));
    const rejected = queued(createAcknowledgeCardCommand('knowledge_decision_flow', context), 'rejected');
    const conflict = queued(createCompleteTaskCommand('task_facilitate_session', context), 'conflict');

    expect(applyParticipantCommandOverlay(authoritativeView(), [pending], 'offline').sync_status).toBe('offline');
    expect(applyParticipantCommandOverlay(authoritativeView(), [pending, rejected], 'offline').sync_status).toBe('rejected');
    expect(applyParticipantCommandOverlay(authoritativeView(), [pending, rejected, conflict], 'offline').sync_status).toBe('conflict');
  });

  it('does not overlay commands already marked synced', () => {
    const command = createAcknowledgeCardCommand('knowledge_decision_flow', context);

    const result = applyParticipantCommandOverlay(authoritativeView(), [queued(command, 'synced')], 'online');
    const card = result.cards.find((item) => item.card_id === 'knowledge_decision_flow');

    expect(result.sync_status).toBe('synced');
    expect(card?.pending_sync).toBe(false);
    expect(card?.acknowledged).toBe(false);
  });
});
