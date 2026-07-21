import type { ParticipantSyncRuntime } from '../../application/sync/OfflineSyncTypes';
import { SupabaseCommandGatewayTransport } from './SupabaseCommandGatewayTransport';
import { SupabaseParticipantProjectionLoader } from './SupabaseParticipantProjectionLoader';
import type { SupabaseHttpConfig } from './SupabaseHttp';

export function createSupabaseParticipantSyncRuntime(
  config: SupabaseHttpConfig,
): ParticipantSyncRuntime {
  return {
    command_transport: new SupabaseCommandGatewayTransport(config),
    projection_loader: new SupabaseParticipantProjectionLoader(config),
  };
}
