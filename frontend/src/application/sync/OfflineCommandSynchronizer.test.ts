import { describe, expect, it, vi } from 'vitest';
import todayFixture from '../../dev/today-view.day1.fixture.json';
import type { CommandResult } from '../../contracts/generated/command-result';
import type { TodayView } from '../../contracts/generated/today-view';
import { createCompleteTaskCommand } from '../commands/task';
import { MemoryCommandQueue, type OfflineQueueableCommand } from '../offline/OfflineCommandQueue';
import { OfflineCommandSynchronizer } from './OfflineCommandSynchronizer';
import type { OfflineDeliveryResult } from './OfflineSyncTypes';

const attemptTime = '2026-07-21T08:00:00.000Z';
const settledTime = '2026-07-21T08:00:01.000Z';

function command(commandId: string, taskId = 'task_team_agreement'): OfflineQueueableCommand {
  const generated = createCompleteTaskCommand(taskId, {
    actor_id: 'participant_01',
    actor_role: 'participant',
    expedition_id: 'ilka_demo_2026_01',
    day_number: 1,
    stage_id: 'onboarding',
  });
  return {
    ...generated,
    command_id: commandId,
    idempotency_key: commandId,
    issued_at: '2026-07-21T07:55:00.000Z',
  };
}

function commandResult(
  outcome: CommandResult['outcome'],
  commandId: string,
  options: Partial<CommandResult['receipt']> = {},
): CommandResult {
  return {
    outcome,
    replayed: false,
    persisted: outcome !== 'conflict',
    receipt: {
      command_id: commandId,
      expedition_id: '50000000-0000-0000-0000-000000000001',
      expedition_key: 'ilka_demo_2026_01',
      command_type: 'complete_task',
      actor_auth_user_id: '10000000-0000-0000-0000-000000000001',
      actor_profile_id: '20000000-0000-0000-0000-000000000001',
      actor_membership_id: '30000000-0000-0000-0000-000000000001',
      actor_participant_id: '40000000-0000-0000-0000-000000000001',
      actor_role: 'participant',
      request_hash: 'a'.repeat(64),
      status: outcome,
      received_at: attemptTime,
      processed_at: settledTime,
      event_ids: outcome === 'accepted' ? [`evt_${commandId.slice(4)}_01`] : [],
      stream_position: outcome === 'accepted' ? 1 : 0,
      projection_version: outcome === 'accepted' ? 2 : 1,
      runtime_release_id: '60000000-0000-0000-0000-000000000001',
      reducer_version: 'day1_complete_task_v1',
      rejection_code: outcome === 'rejected' ? 'task_already_terminal' : null,
      rejection_message: outcome === 'rejected' ? 'Task is already terminal.' : null,
      conflict_code: outcome === 'conflict' ? 'stream_position_conflict' : null,
      ...options,
    },
    projection_updates: outcome === 'accepted'
      ? [{ projection_key: 'today_view:participant_01', projection_version: 2, source_stream_position: 1 }]
      : [],
    expected_stream_position: 0,
    current_stream_position: outcome === 'accepted' ? 1 : 0,
  };
}

function runtime(
  queue: MemoryCommandQueue,
  deliveries: OfflineDeliveryResult[],
  projection: TodayView = todayFixture as TodayView,
) {
  const dispatch = vi.fn(async () => deliveries.shift() ?? {
    kind: 'retryable_error' as const,
    error: { code: 'missing_delivery', message: 'No delivery configured.', retryable: true },
  });
  const load = vi.fn(async () => projection);
  const projections: TodayView[] = [];
  const synchronizer = new OfflineCommandSynchronizer({
    queue,
    transport: { dispatch },
    projection_loader: { load },
    participant_id: 'participant_01',
    expedition_key: 'ilka_demo_2026_01',
    is_online: () => true,
    now: (() => {
      const values = [attemptTime, settledTime, attemptTime, settledTime];
      return () => values.shift() ?? settledTime;
    })(),
    on_projection: (value) => projections.push(value),
  });
  return { synchronizer, dispatch, load, projections };
}

describe('OfflineCommandSynchronizer', () => {
  it('marks an accepted command synced only after authoritative projection refetch', async () => {
    const queue = new MemoryCommandQueue(() => attemptTime);
    const queued = await queue.enqueue(command('cmd_sync_accept'));
    const setup = runtime(queue, [{ kind: 'result', result: commandResult('accepted', 'cmd_sync_accept') }]);

    const summary = await setup.synchronizer.sync();
    const [stored] = await queue.list();

    expect(summary).toEqual({ processed: 1, synced: 1, rejected: 0, conflicts: 0, stop_reason: 'completed' });
    expect(stored?.status).toBe('synced');
    expect(stored?.attempts).toBe(1);
    expect(stored?.receipt?.event_ids).toEqual(['evt_sync_accept_01']);
    expect(setup.load).toHaveBeenCalledWith('ilka_demo_2026_01', 'participant_01');
    expect(setup.projections).toHaveLength(1);
    expect(setup.dispatch).toHaveBeenCalledWith(queued.command);
  });

  it('accepts an exact replay without changing the stored command', async () => {
    const queue = new MemoryCommandQueue(() => attemptTime);
    const queued = await queue.enqueue(command('cmd_sync_replay'));
    const result = commandResult('accepted', 'cmd_sync_replay');
    result.replayed = true;
    const setup = runtime(queue, [{ kind: 'result', result }]);

    await setup.synchronizer.sync();
    const [stored] = await queue.list();

    expect(stored?.status).toBe('synced');
    expect(stored?.receipt?.replayed).toBe(true);
    expect(stored?.command).toEqual(queued.command);
  });

  it('persists a deterministic rejection and refetches TodayView', async () => {
    const queue = new MemoryCommandQueue(() => attemptTime);
    await queue.enqueue(command('cmd_sync_reject'));
    const setup = runtime(queue, [{ kind: 'result', result: commandResult('rejected', 'cmd_sync_reject') }]);

    const summary = await setup.synchronizer.sync();
    const [stored] = await queue.list();

    expect(summary.rejected).toBe(1);
    expect(stored?.status).toBe('rejected');
    expect(stored?.last_error?.code).toBe('task_already_terminal');
    expect(setup.load).toHaveBeenCalledOnce();
  });

  it('stops FIFO delivery after a stream conflict', async () => {
    const queue = new MemoryCommandQueue(() => attemptTime);
    await queue.enqueue(command('cmd_sync_conflict'));
    await queue.enqueue(command('cmd_sync_after_conflict', 'task_other'));
    const setup = runtime(queue, [
      { kind: 'result', result: commandResult('conflict', 'cmd_sync_conflict') },
      { kind: 'result', result: commandResult('accepted', 'cmd_sync_after_conflict') },
    ]);

    const summary = await setup.synchronizer.sync();
    const [first, second] = await queue.list();

    expect(summary.stop_reason).toBe('conflict');
    expect(first?.status).toBe('conflict');
    expect(second?.status).toBe('pending');
    expect(setup.dispatch).toHaveBeenCalledTimes(1);
    expect(setup.load).toHaveBeenCalledOnce();
  });

  it('keeps retryable failures pending and increments attempts', async () => {
    const queue = new MemoryCommandQueue(() => attemptTime);
    await queue.enqueue(command('cmd_sync_retry'));
    const setup = runtime(queue, [{
      kind: 'retryable_error',
      error: { code: 'persistence_unavailable', message: 'Try later.', retryable: true },
    }]);

    const summary = await setup.synchronizer.sync();
    const [stored] = await queue.list();

    expect(summary.stop_reason).toBe('retryable_error');
    expect(stored?.status).toBe('pending');
    expect(stored?.attempts).toBe(1);
    expect(stored?.last_error?.retryable).toBe(true);
  });

  it('keeps a command pending when authentication is unavailable', async () => {
    const queue = new MemoryCommandQueue(() => attemptTime);
    await queue.enqueue(command('cmd_sync_auth'));
    const setup = runtime(queue, [{
      kind: 'auth_unavailable',
      error: { code: 'authentication_required', message: 'Sign in.', retryable: true },
    }]);

    const summary = await setup.synchronizer.sync();
    const [stored] = await queue.list();

    expect(summary.stop_reason).toBe('authentication_required');
    expect(stored?.status).toBe('pending');
  });

  it('turns a terminal transport error into rejected without projection mutation', async () => {
    const queue = new MemoryCommandQueue(() => attemptTime);
    await queue.enqueue(command('cmd_sync_terminal'));
    const setup = runtime(queue, [{
      kind: 'terminal_error',
      error: { code: 'permission_denied', message: 'Not allowed.', retryable: false },
    }]);

    await setup.synchronizer.sync();
    const [stored] = await queue.list();

    expect(stored?.status).toBe('rejected');
    expect(stored?.last_error?.code).toBe('permission_denied');
    expect(setup.load).not.toHaveBeenCalled();
  });

  it('keeps an accepted receipt pending when projection reconciliation fails', async () => {
    const queue = new MemoryCommandQueue(() => attemptTime);
    await queue.enqueue(command('cmd_sync_projection_error'));
    const setup = runtime(queue, [{ kind: 'result', result: commandResult('accepted', 'cmd_sync_projection_error') }]);
    setup.load.mockRejectedValueOnce(new Error('Projection offline'));

    const summary = await setup.synchronizer.sync();
    const [stored] = await queue.list();

    expect(summary.stop_reason).toBe('projection_error');
    expect(stored?.status).toBe('pending');
    expect(stored?.receipt?.outcome).toBe('accepted');
    expect(stored?.last_error?.code).toBe('projection_fetch_failed');
  });

  it('is single-flight for concurrent sync triggers', async () => {
    const queue = new MemoryCommandQueue(() => attemptTime);
    await queue.enqueue(command('cmd_sync_single_flight'));
    let resolveDelivery!: (value: OfflineDeliveryResult) => void;
    const pendingDelivery = new Promise<OfflineDeliveryResult>((resolve) => { resolveDelivery = resolve; });
    const dispatch = vi.fn(() => pendingDelivery);
    const load = vi.fn(async () => todayFixture as TodayView);
    const synchronizer = new OfflineCommandSynchronizer({
      queue,
      transport: { dispatch },
      projection_loader: { load },
      participant_id: 'participant_01',
      expedition_key: 'ilka_demo_2026_01',
      is_online: () => true,
      now: () => attemptTime,
    });

    const first = synchronizer.sync();
    const second = synchronizer.sync();
    expect(second).toBe(first);
    resolveDelivery({ kind: 'result', result: commandResult('accepted', 'cmd_sync_single_flight') });
    await first;

    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('does not submit while offline', async () => {
    const queue = new MemoryCommandQueue(() => attemptTime);
    await queue.enqueue(command('cmd_sync_offline'));
    const dispatch = vi.fn();
    const synchronizer = new OfflineCommandSynchronizer({
      queue,
      transport: { dispatch },
      projection_loader: { load: vi.fn() },
      participant_id: 'participant_01',
      expedition_key: 'ilka_demo_2026_01',
      is_online: () => false,
    });

    const summary = await synchronizer.sync();

    expect(summary.stop_reason).toBe('offline');
    expect(dispatch).not.toHaveBeenCalled();
  });
});
