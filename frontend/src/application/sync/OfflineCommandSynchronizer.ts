import type {
  OfflineCommandQueue,
  QueueError,
  QueuedCommand,
} from '../offline/OfflineCommandQueue';
import {
  type OfflineCommandTransport,
  type OfflineSyncSummary,
  type OfflineSynchronizerCallbacks,
  type ParticipantProjectionLoader,
  queueReceiptFromResult,
} from './OfflineSyncTypes';

export type OfflineCommandSynchronizerOptions = OfflineSynchronizerCallbacks & {
  queue: OfflineCommandQueue;
  transport: OfflineCommandTransport;
  projection_loader: ParticipantProjectionLoader;
  participant_id: string;
  expedition_key: string;
  is_online?: () => boolean;
  now?: () => string;
};

function defaultOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

function projectionError(error: unknown): QueueError {
  return {
    code: 'projection_fetch_failed',
    message: error instanceof Error ? error.message : 'Authoritative TodayView could not be loaded.',
    retryable: true,
  };
}

export class OfflineCommandSynchronizer {
  private readonly queue: OfflineCommandQueue;
  private readonly transport: OfflineCommandTransport;
  private readonly projectionLoader: ParticipantProjectionLoader;
  private readonly participantId: string;
  private readonly expeditionKey: string;
  private readonly isOnline: () => boolean;
  private readonly now: () => string;
  private readonly callbacks: OfflineSynchronizerCallbacks;
  private activeCycle: Promise<OfflineSyncSummary> | null = null;

  constructor(options: OfflineCommandSynchronizerOptions) {
    this.queue = options.queue;
    this.transport = options.transport;
    this.projectionLoader = options.projection_loader;
    this.participantId = options.participant_id;
    this.expeditionKey = options.expedition_key;
    this.isOnline = options.is_online ?? defaultOnline;
    this.now = options.now ?? (() => new Date().toISOString());
    this.callbacks = {
      on_queue_changed: options.on_queue_changed,
      on_projection: options.on_projection,
    };
  }

  sync(): Promise<OfflineSyncSummary> {
    if (this.activeCycle) return this.activeCycle;
    const cycle = this.run().finally(() => {
      if (this.activeCycle === cycle) this.activeCycle = null;
    });
    this.activeCycle = cycle;
    return cycle;
  }

  retryPending(): Promise<OfflineSyncSummary> {
    return this.sync();
  }

  private async publishQueue(): Promise<QueuedCommand[]> {
    const items = await this.queue.list();
    this.callbacks.on_queue_changed?.(items);
    return items;
  }

  private async loadProjection(): Promise<void> {
    const projection = await this.projectionLoader.load(this.expeditionKey, this.participantId);
    this.callbacks.on_projection?.(projection);
  }

  private summary(
    processed: number,
    synced: number,
    rejected: number,
    conflicts: number,
    stopReason: OfflineSyncSummary['stop_reason'],
  ): OfflineSyncSummary {
    return {
      processed,
      synced,
      rejected,
      conflicts,
      stop_reason: stopReason,
    };
  }

  private async run(): Promise<OfflineSyncSummary> {
    let processed = 0;
    let synced = 0;
    let rejected = 0;
    let conflicts = 0;

    if (!this.isOnline()) return this.summary(0, 0, 0, 0, 'offline');

    const items = await this.publishQueue();
    for (const item of items) {
      if (item.status !== 'pending') continue;
      if (!this.isOnline()) {
        return this.summary(processed, synced, rejected, conflicts, 'offline');
      }

      const attemptAt = this.now();
      await this.queue.update(item.local_id, {
        attempts: item.attempts + 1,
        last_attempt_at: attemptAt,
        last_error: null,
      });
      await this.publishQueue();

      let delivery;
      try {
        delivery = await this.transport.dispatch(item.command);
      } catch (error) {
        delivery = {
          kind: 'retryable_error' as const,
          error: {
            code: 'network_unavailable',
            message: error instanceof Error ? error.message : 'Command Gateway is unavailable.',
            retryable: true,
          },
        };
      }
      processed += 1;

      if (delivery.kind === 'auth_unavailable') {
        await this.queue.update(item.local_id, {
          status: 'pending',
          last_error: delivery.error,
        });
        await this.publishQueue();
        return this.summary(processed, synced, rejected, conflicts, 'authentication_required');
      }

      if (delivery.kind === 'retryable_error') {
        await this.queue.update(item.local_id, {
          status: 'pending',
          last_error: delivery.error,
        });
        await this.publishQueue();
        return this.summary(processed, synced, rejected, conflicts, 'retryable_error');
      }

      if (delivery.kind === 'terminal_error') {
        await this.queue.update(item.local_id, {
          status: 'rejected',
          settled_at: this.now(),
          last_error: delivery.error,
          receipt: null,
        });
        rejected += 1;
        await this.publishQueue();
        continue;
      }

      const result = delivery.result;
      const receipt = queueReceiptFromResult(result);

      if (result.outcome === 'accepted') {
        try {
          await this.loadProjection();
        } catch (error) {
          await this.queue.update(item.local_id, {
            status: 'pending',
            receipt,
            last_error: projectionError(error),
          });
          await this.publishQueue();
          return this.summary(processed, synced, rejected, conflicts, 'projection_error');
        }

        await this.queue.update(item.local_id, {
          status: 'synced',
          settled_at: this.now(),
          receipt,
          last_error: null,
        });
        synced += 1;
        await this.publishQueue();
        continue;
      }

      if (result.outcome === 'rejected') {
        await this.queue.update(item.local_id, {
          status: 'rejected',
          settled_at: this.now(),
          receipt,
          last_error: {
            code: result.receipt.rejection_code ?? 'command_rejected',
            message: result.receipt.rejection_message ?? 'The command was rejected.',
            retryable: false,
          },
        });
        rejected += 1;
        await this.publishQueue();
        try {
          await this.loadProjection();
        } catch (error) {
          await this.queue.update(item.local_id, { last_error: projectionError(error) });
          await this.publishQueue();
          return this.summary(processed, synced, rejected, conflicts, 'projection_error');
        }
        continue;
      }

      await this.queue.update(item.local_id, {
        status: 'conflict',
        settled_at: this.now(),
        receipt,
        last_error: {
          code: result.receipt.conflict_code ?? 'version_conflict',
          message: 'The Expedition stream changed before this command was committed.',
          retryable: false,
        },
      });
      conflicts += 1;
      await this.publishQueue();
      try {
        await this.loadProjection();
      } catch (error) {
        await this.queue.update(item.local_id, { last_error: projectionError(error) });
        await this.publishQueue();
        return this.summary(processed, synced, rejected, conflicts, 'projection_error');
      }
      return this.summary(processed, synced, rejected, conflicts, 'conflict');
    }

    return this.summary(processed, synced, rejected, conflicts, 'completed');
  }
}
