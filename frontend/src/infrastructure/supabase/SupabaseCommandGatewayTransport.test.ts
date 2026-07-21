import { describe, expect, it, vi } from 'vitest';
import type { CommandResult } from '../../contracts/generated/command-result';
import { createCompleteTaskCommand } from '../../application/commands/task';
import type { OfflineQueueableCommand } from '../../application/offline/OfflineCommandQueue';
import { SupabaseCommandGatewayTransport } from './SupabaseCommandGatewayTransport';

function command(): OfflineQueueableCommand {
  const value = createCompleteTaskCommand('task_team_agreement', {
    actor_id: 'participant_01',
    actor_role: 'participant',
    expedition_id: 'ilka_demo_2026_01',
    day_number: 1,
    stage_id: 'onboarding',
  });
  return {
    ...value,
    command_id: 'cmd_http_01',
    idempotency_key: 'cmd_http_01',
    issued_at: '2026-07-21T08:00:00.000Z',
  };
}

function result(overrides: Partial<CommandResult['receipt']> = {}): CommandResult {
  return {
    outcome: 'accepted',
    replayed: false,
    persisted: true,
    receipt: {
      command_id: 'cmd_http_01',
      expedition_id: '50000000-0000-0000-0000-000000000001',
      expedition_key: 'ilka_demo_2026_01',
      command_type: 'complete_task',
      actor_auth_user_id: '10000000-0000-0000-0000-000000000001',
      actor_profile_id: '20000000-0000-0000-0000-000000000001',
      actor_membership_id: '30000000-0000-0000-0000-000000000001',
      actor_participant_id: '40000000-0000-0000-0000-000000000001',
      actor_role: 'participant',
      request_hash: 'a'.repeat(64),
      status: 'accepted',
      received_at: '2026-07-21T08:00:01.000Z',
      processed_at: '2026-07-21T08:00:02.000Z',
      event_ids: ['evt_http_01'],
      stream_position: 1,
      projection_version: 2,
      runtime_release_id: '60000000-0000-0000-0000-000000000001',
      reducer_version: 'day1_complete_task_v1',
      rejection_code: null,
      rejection_message: null,
      conflict_code: null,
      ...overrides,
    },
    projection_updates: [],
    expected_stream_position: 0,
    current_stream_position: 1,
  };
}

function transport(fetchImpl: typeof fetch, token: string | null = 'session-token') {
  return new SupabaseCommandGatewayTransport({
    supabase_url: 'https://example.supabase.co/',
    public_api_key: 'public-key',
    get_access_token: () => token,
    fetch_impl: fetchImpl,
  });
}

describe('SupabaseCommandGatewayTransport', () => {
  it('sends the exact stored command and returns an accepted result', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Response(JSON.stringify({ request_id: 'request_01', data: result() }), { status: 200 })
    );
    const queued = command();

    const delivery = await transport(fetchImpl).dispatch(queued);

    expect(delivery.kind).toBe('result');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/command-gateway',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(queued) }),
    );
    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer session-token');
    expect(headers.apikey).toBe('public-key');
  });

  it('returns authentication unavailable without making a request', async () => {
    const fetchImpl = vi.fn();
    const delivery = await transport(fetchImpl, null).dispatch(command());

    expect(delivery.kind).toBe('auth_unavailable');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('classifies retryable gateway errors', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      request_id: 'request_02',
      error: { code: 'persistence_unavailable', message: 'Try later.', retryable: true },
    }), { status: 503 }));

    const delivery = await transport(fetchImpl).dispatch(command());

    expect(delivery).toEqual({
      kind: 'retryable_error',
      error: { code: 'persistence_unavailable', message: 'Try later.', retryable: true },
    });
  });

  it('classifies terminal gateway errors', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      request_id: 'request_03',
      error: { code: 'permission_denied', message: 'Not allowed.', retryable: false },
    }), { status: 403 }));

    const delivery = await transport(fetchImpl).dispatch(command());

    expect(delivery).toEqual({
      kind: 'terminal_error',
      error: { code: 'permission_denied', message: 'Not allowed.', retryable: false },
    });
  });

  it('rejects a receipt for another command identity as retryable corruption', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      request_id: 'request_04',
      data: result({ command_id: 'cmd_other' }),
    }), { status: 200 }));

    const delivery = await transport(fetchImpl).dispatch(command());

    expect(delivery.kind).toBe('retryable_error');
    if (delivery.kind === 'retryable_error') {
      expect(delivery.error.code).toBe('invalid_gateway_response');
    }
  });

  it('classifies network exceptions as retryable', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('Network down'); });

    const delivery = await transport(fetchImpl).dispatch(command());

    expect(delivery.kind).toBe('retryable_error');
    if (delivery.kind === 'retryable_error') expect(delivery.error.code).toBe('network_unavailable');
  });

  it('does not accept malformed success data', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ request_id: 'request_05', data: {} }), { status: 200 }));

    const delivery = await transport(fetchImpl).dispatch(command());

    expect(delivery.kind).toBe('terminal_error');
    if (delivery.kind === 'terminal_error') expect(delivery.error.code).toBe('invalid_gateway_response');
  });
});
