import type { CommandResult } from '../../contracts/generated/command-result';
import type { TodayView } from '../../contracts/generated/today-view';
import type {
  OfflineQueueableCommand,
  QueueError,
  QueueReceipt,
  QueuedCommand,
} from '../offline/OfflineCommandQueue';

export type OfflineDeliveryResult =
  | { kind: 'result'; result: CommandResult }
  | { kind: 'retryable_error'; error: QueueError }
  | { kind: 'terminal_error'; error: QueueError }
  | { kind: 'auth_unavailable'; error: QueueError };

export interface OfflineCommandTransport {
  dispatch(command: OfflineQueueableCommand): Promise<OfflineDeliveryResult>;
}

export interface ParticipantProjectionLoader {
  load(expeditionKey: string, participantId: string): Promise<TodayView>;
}

export type ParticipantSyncRuntime = {
  command_transport: OfflineCommandTransport;
  projection_loader: ParticipantProjectionLoader;
  is_online?: () => boolean;
  now?: () => string;
};

export type OfflineSyncStopReason =
  | 'completed'
  | 'offline'
  | 'retryable_error'
  | 'authentication_required'
  | 'conflict'
  | 'projection_error';

export type OfflineSyncSummary = {
  processed: number;
  synced: number;
  rejected: number;
  conflicts: number;
  stop_reason: OfflineSyncStopReason;
};

export type OfflineSynchronizerCallbacks = {
  on_queue_changed?: (items: QueuedCommand[]) => void;
  on_projection?: (projection: TodayView) => void;
};

export function queueReceiptFromResult(result: CommandResult): QueueReceipt {
  return {
    outcome: result.outcome,
    replayed: result.replayed,
    event_ids: [...result.receipt.event_ids],
    stream_position: result.receipt.stream_position,
    projection_version: result.receipt.projection_version,
    rejection_code: result.receipt.rejection_code,
    rejection_message: result.receipt.rejection_message,
    conflict_code: result.receipt.conflict_code,
    expected_stream_position: result.expected_stream_position,
    current_stream_position: result.current_stream_position,
  };
}
