import type { CommandResult } from '../../contracts/generated/command-result';
import type { OfflineCommandTransport, OfflineDeliveryResult } from '../../application/sync/OfflineSyncTypes';
import type { OfflineQueueableCommand, QueueError } from '../../application/offline/OfflineCommandQueue';
import {
  authenticatedHeaders,
  normalizeSupabaseUrl,
  resolveFetch,
  responseJson,
  type SupabaseHttpConfig,
} from './SupabaseHttp';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isCommandResult(value: unknown): value is CommandResult {
  if (!isRecord(value) || !['accepted', 'rejected', 'conflict'].includes(String(value.outcome))) return false;
  if (typeof value.replayed !== 'boolean' || typeof value.persisted !== 'boolean') return false;
  if (!Array.isArray(value.projection_updates)) return false;
  if (!Number.isInteger(value.expected_stream_position) || !Number.isInteger(value.current_stream_position)) return false;
  if (!isRecord(value.receipt)) return false;
  const receipt = value.receipt;
  return typeof receipt.command_id === 'string'
    && typeof receipt.expedition_key === 'string'
    && typeof receipt.command_type === 'string'
    && Array.isArray(receipt.event_ids)
    && receipt.event_ids.every((eventId) => typeof eventId === 'string')
    && Number.isInteger(receipt.stream_position)
    && Number.isInteger(receipt.projection_version)
    && nullableString(receipt.rejection_code)
    && nullableString(receipt.rejection_message)
    && nullableString(receipt.conflict_code);
}

function publicError(value: unknown, status: number): QueueError {
  if (isRecord(value) && isRecord(value.error)) {
    const error = value.error;
    if (
      typeof error.code === 'string'
      && typeof error.message === 'string'
      && typeof error.retryable === 'boolean'
    ) {
      return {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      };
    }
  }
  return {
    code: 'invalid_gateway_response',
    message: `Command Gateway returned an invalid response (${status}).`,
    retryable: status >= 500,
  };
}

function retryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export class SupabaseCommandGatewayTransport implements OfflineCommandTransport {
  private readonly endpoint: string;
  private readonly fetchImpl: ReturnType<typeof resolveFetch>;

  constructor(private readonly config: SupabaseHttpConfig) {
    this.endpoint = `${normalizeSupabaseUrl(config.supabase_url)}/functions/v1/command-gateway`;
    this.fetchImpl = resolveFetch(config.fetch_impl);
  }

  async dispatch(command: OfflineQueueableCommand): Promise<OfflineDeliveryResult> {
    const headers = await authenticatedHeaders(this.config);
    if (!headers) {
      return {
        kind: 'auth_unavailable',
        error: {
          code: 'authentication_required',
          message: 'A valid Supabase session is required before synchronization.',
          retryable: true,
        },
      };
    }

    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(command),
      });
    } catch (error) {
      return {
        kind: 'retryable_error',
        error: {
          code: 'network_unavailable',
          message: error instanceof Error ? error.message : 'Command Gateway is unavailable.',
          retryable: true,
        },
      };
    }

    const body = await responseJson(response);
    if ((response.status === 200 || response.status === 409) && isRecord(body) && isCommandResult(body.data)) {
      const result = body.data;
      if (
        result.receipt.command_id !== command.command_id
        || result.receipt.expedition_key !== command.expedition_id
        || result.receipt.command_type !== command.command_type
      ) {
        return {
          kind: 'retryable_error',
          error: {
            code: 'invalid_gateway_response',
            message: 'Command Gateway receipt identity does not match the queued command.',
            retryable: true,
          },
        };
      }
      return { kind: 'result', result };
    }

    const error = publicError(body, response.status);
    if (response.status === 401 || error.code === 'authentication_required') {
      return { kind: 'auth_unavailable', error: { ...error, retryable: true } };
    }
    if (error.retryable || retryableStatus(response.status)) {
      return { kind: 'retryable_error', error: { ...error, retryable: true } };
    }
    return { kind: 'terminal_error', error: { ...error, retryable: false } };
  }
}
