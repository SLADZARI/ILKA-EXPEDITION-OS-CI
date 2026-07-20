import type { AppBootstrap } from '../application/projections/bootstrap';
import type { TodayView } from '../contracts/generated/today-view';
import type { CaptainDayView } from '../contracts/generated/captain-day-view';
import { todayViewFixture } from './today-view.fixture';
import { captainDayViewFixture } from './captain-day-view.fixture';
import { gamificationViewFixture } from './gamification-view.fixture';
import day1TodayFixture from './today-view.day1.fixture.json';
import day1CaptainFixture from './captain-day-view.day1.fixture.json';
import day1CaptainProgressFixture from './captain-day-view.day1-progress.fixture.json';

export const participantPreviewBootstrap: AppBootstrap = {
  mode: 'participant', actor_id: todayViewFixture.participant_id, today: todayViewFixture, gamification: gamificationViewFixture,
};
export const captainPreviewBootstrap: AppBootstrap = {
  mode: 'captain', actor_id: 'captain_01', day: captainDayViewFixture,
};

export const day1ParticipantPreviewBootstrap: AppBootstrap = {
  mode: 'participant',
  actor_id: day1TodayFixture.participant_id,
  today: day1TodayFixture as TodayView,
};

export const day1CaptainPreviewBootstrap: AppBootstrap = {
  mode: 'captain',
  actor_id: 'captain_01',
  day: day1CaptainFixture as CaptainDayView,
};

export const day1CaptainProgressPreviewBootstrap: AppBootstrap = {
  mode: 'captain',
  actor_id: 'captain_01',
  day: day1CaptainProgressFixture as CaptainDayView,
};

export type PreviewSelection =
  | { mode: 'participant'; state: 'initial' }
  | { mode: 'captain'; state: 'initial' | 'after_sync' };

export function resolvePreviewBootstrap(search: string): AppBootstrap | null {
  const params = new URLSearchParams(search);
  if (params.get('scenario') !== 'day1') return null;
  const mode = params.get('mode');
  if (mode === 'participant') return day1ParticipantPreviewBootstrap;
  if (mode === 'captain' && params.get('state') === 'after_sync') return day1CaptainProgressPreviewBootstrap;
  if (mode === 'captain') return day1CaptainPreviewBootstrap;
  return null;
}

export function previewHref(selection: PreviewSelection): string {
  const params = new URLSearchParams({ scenario: 'day1', mode: selection.mode });
  if (selection.mode === 'captain' && selection.state === 'after_sync') params.set('state', 'after_sync');
  return `?${params.toString()}`;
}
