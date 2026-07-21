import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createStartTaskCommand } from '../commands/task';
import {
  IndexedDbCommandQueue,
  MemoryCommandQueue,
  type OfflineQueueableCommand,
  type QueueReceipt,
} from './OfflineCommandQueue';

const fixedTime = '2026-07-20T12:00:00.000Z';

function createCommand(commandId: string): OfflineQueueableCommand {
  const generated = createStartTaskCommand('task_01', {
    actor_id: 'participant_01',
    actor_role: 'participant',
    expedition_id: 'expedition_01',
    day_number: 1,
    stage_id: 'onboarding',
  });
  return {
    ...generated,
    command_id: commandId,
    idempotency_key: commandId,
    issued_at: fixedTime,
  };
}

function receipt(): QueueReceipt {
  return {
    outcome: 'accepted',
    replayed: false,
    event_ids: ['evt_queue_01'],
    stream_position: 1,
    projection_version: 2,
    rejection_code: null,
    rejection_message: null,
    conflict_code: null,
    expected_stream_position: 0,
    current_stream_position: 1,
  };
}

describe('IndexedDbCommandQueue', () => {
  it('enqueues the same command idempotently', async () => {
    const queue = new IndexedDbCommandQueue({
      indexedDBFactory: new IDBFactory(),
      databaseName: 'queue-idempotency',
      now: () => fixedTime,
    });
    const command = createCommand('cmd_idempotent');

    const first = await queue.enqueue(command);
    const second = await queue.enqueue(command);

    expect(second).toEqual(first);
    expect(await queue.list()).toEqual([first]);
  });

  it('persists queued commands across queue instances', async () => {
    const factory = new IDBFactory();
    const databaseName = 'queue-persistence';
    const command = createCommand('cmd_persisted');
    const firstQueue = new IndexedDbCommandQueue({ indexedDBFactory: factory, databaseName, now: () => fixedTime });
    await firstQueue.enqueue(command);

    const secondQueue = new IndexedDbCommandQueue({ indexedDBFactory: factory, databaseName });
    const items = await secondQueue.list();

    expect(items).toHaveLength(1);
    expect(items[0]?.command.command_id).toBe(command.command_id);
  });

  it('updates delivery metadata without replacing command identity', async () => {
    const queue = new IndexedDbCommandQueue({
      indexedDBFactory: new IDBFactory(),
      databaseName: 'queue-update',
      now: () => fixedTime,
    });
    const command = createCommand('cmd_updated');
    const queued = await queue.enqueue(command);

    await queue.update(queued.local_id, {
      status: 'conflict',
      attempts: 2,
      last_attempt_at: '2026-07-20T12:01:00.000Z',
      settled_at: '2026-07-20T12:01:01.000Z',
      last_error: { code: 'version_conflict', message: 'Projection changed', retryable: false },
      receipt: { ...receipt(), outcome: 'conflict', conflict_code: 'version_conflict' },
    });

    const [updated] = await queue.list();
    expect(updated?.local_id).toBe(queued.local_id);
    expect(updated?.command).toEqual(command);
    expect(updated?.status).toBe('conflict');
    expect(updated?.attempts).toBe(2);
    expect(updated?.receipt?.conflict_code).toBe('version_conflict');
  });

  it('persists accepted receipt metadata across IndexedDB instances', async () => {
    const factory = new IDBFactory();
    const databaseName = 'queue-receipt-persistence';
    const firstQueue = new IndexedDbCommandQueue({ indexedDBFactory: factory, databaseName, now: () => fixedTime });
    const queued = await firstQueue.enqueue(createCommand('cmd_receipt'));
    await firstQueue.update(queued.local_id, {
      status: 'synced',
      attempts: 1,
      settled_at: fixedTime,
      receipt: receipt(),
    });

    const secondQueue = new IndexedDbCommandQueue({ indexedDBFactory: factory, databaseName });
    const [stored] = await secondQueue.list();
    expect(stored?.status).toBe('synced');
    expect(stored?.receipt?.event_ids).toEqual(['evt_queue_01']);
    expect(stored?.command).toEqual(queued.command);
  });

  it('falls back to memory when IndexedDB is unavailable', async () => {
    const fallback = new MemoryCommandQueue(() => fixedTime);
    const queue = new IndexedDbCommandQueue({ indexedDBFactory: null, fallback, now: () => fixedTime });
    const command = createCommand('cmd_fallback');

    const queued = await queue.enqueue(command);

    expect(await queue.list()).toEqual([queued]);
  });
});
