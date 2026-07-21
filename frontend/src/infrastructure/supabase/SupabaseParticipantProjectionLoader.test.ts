import { describe, expect, it, vi } from 'vitest';
import todayFixture from '../../dev/today-view.day1.fixture.json';
import {
  ProjectionTransportError,
  SupabaseParticipantProjectionLoader,
} from './SupabaseParticipantProjectionLoader';

function loader(fetchImpl: typeof fetch, token: string | null = 'session-token') {
  return new SupabaseParticipantProjectionLoader({
    supabase_url: 'https://example.supabase.co/',
    public_api_key: 'public-key',
    get_access_token: () => token,
    fetch_impl: fetchImpl,
  });
}

describe('SupabaseParticipantProjectionLoader', () => {
  it('loads an authoritative TodayView with matching identity', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(todayFixture), { status: 200 }));

    const projection = await loader(fetchImpl).load('ilka_demo_2026_01', 'participant_01');

    expect(projection).toEqual(todayFixture);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/rpc/get_today_view',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ p_expedition_key: 'ilka_demo_2026_01' }),
      }),
    );
  });

  it('requires an access token before requesting a projection', async () => {
    const fetchImpl = vi.fn();

    await expect(loader(fetchImpl, null).load('ilka_demo_2026_01', 'participant_01'))
      .rejects.toMatchObject({ code: 'authentication_required', retryable: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects an invalid projection document', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ expedition_id: 'ilka_demo_2026_01' }), { status: 200 }));

    await expect(loader(fetchImpl).load('ilka_demo_2026_01', 'participant_01'))
      .rejects.toMatchObject({ code: 'invalid_projection_response' });
  });

  it('rejects a projection for another Participant', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ...todayFixture,
      participant_id: 'participant_02',
    }), { status: 200 }));

    await expect(loader(fetchImpl).load('ilka_demo_2026_01', 'participant_01'))
      .rejects.toMatchObject({ code: 'projection_identity_mismatch', retryable: false });
  });

  it('classifies server projection errors as retryable', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ message: 'Database unavailable' }), { status: 503 }));

    await expect(loader(fetchImpl).load('ilka_demo_2026_01', 'participant_01'))
      .rejects.toMatchObject({ code: 'projection_fetch_failed', retryable: true });
  });

  it('uses a stable typed transport error', () => {
    const error = new ProjectionTransportError('projection_fetch_failed', 'Failed', true);
    expect(error.name).toBe('ProjectionTransportError');
    expect(error.code).toBe('projection_fetch_failed');
  });
});
