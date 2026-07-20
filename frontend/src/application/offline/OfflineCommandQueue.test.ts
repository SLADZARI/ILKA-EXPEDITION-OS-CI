import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createStartTaskCommand } from '../commands/task';
import {
  IndexedDbCommandQueue,
  MemoryCommandQueue,
  type OfflineQueueableCommand,
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
    idempotency_key: `expedition_01:start_task:${commandId}`,
    issued_at: fixedTime,
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
      last_error: { code: 'revision_conflict', message: 'Projection changed', retryable: true },
    });

    const [updated] = await queue.list();
    expect(updated?.local_id).toBe(queued.local_id);
    expect(updated?.command).toEqual(command);
    expect(updated?.status).toBe('conflict');
    expect(updated?.attempts).toBe(2);
  });

  it('falls back to memory when IndexedDB is unavailable', async () => {
    const fallback = new MemoryCommandQueue(() => fixedTime);
    const queue = new IndexedDbCommandQueue({ indexedDBFactory: null, fallback, now: () => fixedTime });
    const command = createCommand('cmd_fallback');

    const queued = await queue.enqueue(command);

    expect(await queue.list()).toEqual([queued]);
  });
});
