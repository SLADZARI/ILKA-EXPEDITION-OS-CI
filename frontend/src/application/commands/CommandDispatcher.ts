import type { Command } from '../../contracts/generated/command';
import type { OfflineCommandQueue, OfflineQueueableCommand, QueuedCommand } from '../offline/OfflineCommandQueue';

export type ServerConfirmedCommand = Exclude<Command, OfflineQueueableCommand>;
export type OfflineDispatchResult = { state: 'queued'; queued: QueuedCommand };
export type ServerDispatchResult =
  | { state: 'synced'; event_ids?: string[] }
  | { state: 'conflict' | 'rejected'; code: string; message: string }
  | { state: 'unavailable'; code: 'server_transport_missing'; message: string };

export interface ServerCommandTransport {
  dispatch(command: ServerConfirmedCommand): Promise<ServerDispatchResult>;
}

export class CommandDispatcher {
  constructor(
    private readonly queue: OfflineCommandQueue,
    private readonly serverTransport?: ServerCommandTransport,
  ) {}

  async dispatch(command: OfflineQueueableCommand): Promise<OfflineDispatchResult> {
    return { state: 'queued', queued: await this.queue.enqueue(command) };
  }

  async dispatchServer(command: ServerConfirmedCommand): Promise<ServerDispatchResult> {
    if (!this.serverTransport) {
      return { state: 'unavailable', code: 'server_transport_missing', message: 'Server transport is not configured.' };
    }
    return this.serverTransport.dispatch(command);
  }
}
