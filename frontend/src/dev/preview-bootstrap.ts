import type { AppBootstrap } from '../application/projections/bootstrap';
import { todayViewFixture } from './today-view.fixture';
import { captainDayViewFixture } from './captain-day-view.fixture';
import { gamificationViewFixture } from './gamification-view.fixture';

export const participantPreviewBootstrap: AppBootstrap = {
  mode: 'participant', actor_id: todayViewFixture.participant_id, today: todayViewFixture, gamification: gamificationViewFixture,
};
export const captainPreviewBootstrap: AppBootstrap = {
  mode: 'captain', actor_id: 'captain_01', day: captainDayViewFixture,
};
