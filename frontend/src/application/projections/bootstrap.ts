import type { TodayView } from '../../contracts/generated/today-view';
import type { CaptainDayView } from '../../contracts/generated/captain-day-view';
import type { GamificationView } from '../../contracts/generated/gamification-view';
import type { ServerCommandTransport } from '../commands/CommandDispatcher';
import type { ParticipantSyncRuntime } from '../sync/OfflineSyncTypes';

export type ParticipantBootstrap = {
  mode: 'participant';
  actor_id: string;
  today: TodayView;
  gamification?: GamificationView;
  sync_runtime?: ParticipantSyncRuntime;
};

export type CaptainBootstrap = {
  mode: 'captain';
  actor_id: string;
  day: CaptainDayView;
  server_transport?: ServerCommandTransport;
};

export type AppBootstrap = ParticipantBootstrap | CaptainBootstrap;

declare global {
  interface Window {
    __ILKA_BOOTSTRAP__?: AppBootstrap;
  }
}
