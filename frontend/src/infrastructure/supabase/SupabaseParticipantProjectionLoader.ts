import type { TodayView } from '../../contracts/generated/today-view';
import type { ParticipantProjectionLoader } from '../../application/sync/OfflineSyncTypes';
import {
  authenticatedHeaders,
  normalizeSupabaseUrl,
  resolveFetch,
  responseJson,
  type SupabaseHttpConfig,
} from './SupabaseHttp';

const DAY_STATUSES = new Set(['not_started', 'active', 'review', 'closed', 'transition_failed']);
const SYNC_STATUSES = new Set(['synced', 'pending', 'conflict', 'rejected', 'offline']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTodayView(value: unknown): value is TodayView {
  if (!isRecord(value)) return false;
  if (
    typeof value.expedition_id !== 'string'
    || typeof value.participant_id !== 'string'
    || typeof value.local_date !== 'string'
    || !isRecord(value.day)
    || !isRecord(value.stage)
    || !Array.isArray(value.cards)
    || !Array.isArray(value.tasks)
    || !Array.isArray(value.outputs)
    || !SYNC_STATUSES.has(String(value.sync_status))
  ) return false;

  return Number.isInteger(value.day.number)
    && DAY_STATUSES.has(String(value.day.status))
    && typeof value.stage.stage_id === 'string'
    && typeof value.stage.title === 'string'
    && value.cards.every((card) => isRecord(card) && typeof card.card_id === 'string')
    && value.tasks.every((task) => isRecord(task) && typeof task.task_id === 'string')
    && value.outputs.every((output) => isRecord(output) && typeof output.output_id === 'string');
}

export class ProjectionTransportError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ProjectionTransportError';
  }
}

export class SupabaseParticipantProjectionLoader implements ParticipantProjectionLoader {
  private readonly endpoint: string;
  private readonly fetchImpl: ReturnType<typeof resolveFetch>;

  constructor(private readonly config: SupabaseHttpConfig) {
    this.endpoint = `${normalizeSupabaseUrl(config.supabase_url)}/rest/v1/rpc/get_today_view`;
    this.fetchImpl = resolveFetch(config.fetch_impl);
  }

  async load(expeditionKey: string, participantId: string): Promise<TodayView> {
    const headers = await authenticatedHeaders(this.config);
    if (!headers) {
      throw new ProjectionTransportError(
        'authentication_required',
        'A valid Supabase session is required before loading TodayView.',
        true,
      );
    }

    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ p_expedition_key: expeditionKey }),
      });
    } catch (error) {
      throw new ProjectionTransportError(
        'projection_fetch_failed',
        error instanceof Error ? error.message : 'TodayView request failed.',
        true,
      );
    }

    const body = await responseJson(response);
    if (!response.ok) {
      const message = isRecord(body) && typeof body.message === 'string'
        ? body.message
        : `TodayView request failed (${response.status}).`;
      throw new ProjectionTransportError(
        response.status === 401 ? 'authentication_required' : 'projection_fetch_failed',
        message,
        response.status === 401 || response.status >= 500,
      );
    }

    if (!isTodayView(body)) {
      throw new ProjectionTransportError(
        'invalid_projection_response',
        'The server returned an invalid TodayView document.',
        true,
      );
    }

    if (body.expedition_id !== expeditionKey || body.participant_id !== participantId) {
      throw new ProjectionTransportError(
        'projection_identity_mismatch',
        'The server returned a TodayView for another Expedition or Participant.',
        false,
      );
    }

    return body;
  }
}
