import { describe, expect, it } from 'vitest';
import {
  day1CaptainPreviewBootstrap,
  day1CaptainProgressPreviewBootstrap,
  day1ParticipantPreviewBootstrap,
  previewHref,
  resolvePreviewBootstrap,
} from './preview-bootstrap';

describe('Day 1 preview bootstrap', () => {
  it('does not activate without the explicit Day 1 scenario', () => {
    expect(resolvePreviewBootstrap('')).toBeNull();
    expect(resolvePreviewBootstrap('?mode=participant')).toBeNull();
  });

  it('resolves the Participant Day 1 projection', () => {
    const bootstrap = resolvePreviewBootstrap('?scenario=day1&mode=participant');

    expect(bootstrap).toEqual(day1ParticipantPreviewBootstrap);
    expect(bootstrap?.mode).toBe('participant');
    if (bootstrap?.mode === 'participant') {
      expect(bootstrap.today.day.number).toBe(1);
      expect(bootstrap.today.stage.stage_id).toBe('onboarding');
      expect(bootstrap.actor_id).toBe(bootstrap.today.participant_id);
    }
  });

  it('resolves initial and after-sync Captain projections separately', () => {
    const initial = resolvePreviewBootstrap('?scenario=day1&mode=captain');
    const afterSync = resolvePreviewBootstrap('?scenario=day1&mode=captain&state=after_sync');

    expect(initial).toEqual(day1CaptainPreviewBootstrap);
    expect(afterSync).toEqual(day1CaptainProgressPreviewBootstrap);
    if (initial?.mode === 'captain' && afterSync?.mode === 'captain') {
      expect(initial.day.day.number).toBe(1);
      expect(initial.day.stage.stage_id).toBe('onboarding');
      expect(initial.day.participants[0]?.required_tasks_terminal).toBe(false);
      expect(afterSync.day.participants[0]?.required_tasks_terminal).toBe(true);
      expect(afterSync.day.outputs.every((output) => !output.confirmed)).toBe(true);
    }
  });

  it('generates stable preview URLs', () => {
    expect(previewHref({ mode: 'participant', state: 'initial' })).toBe('?scenario=day1&mode=participant');
    expect(previewHref({ mode: 'captain', state: 'initial' })).toBe('?scenario=day1&mode=captain');
    expect(previewHref({ mode: 'captain', state: 'after_sync' })).toBe('?scenario=day1&mode=captain&state=after_sync');
  });
});
