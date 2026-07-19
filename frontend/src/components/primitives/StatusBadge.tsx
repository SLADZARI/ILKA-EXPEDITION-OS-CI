import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import type { StatusTone, SyncState } from '../../contracts/status-maps';
import { SYNC_STATE_LABEL, SYNC_STATE_TONE } from '../../contracts/status-maps';
import { Icon } from './Icon';

const iconBySync: Record<SyncState, string> = {
  synced: 'check', pending: 'clock', conflict: 'alert', rejected: 'x', offline: 'wifiOff',
};

export function StatusBadge({ label, tone = 'neutral', icon }:
  { label: string; tone?: StatusTone; icon?: string }) {
  return (
    <span className={`ilka-badge ilka-badge--${tone}`} data-ui-id={COMPONENT_IDS.status_badge}
      data-variant={tone}>
      {icon && <Icon name={icon} size={13} />}
      <span>{label}</span>
    </span>
  );
}

export function SyncStatus({ state }: { state: SyncState }) {
  return (
    <span data-ui-id={COMPONENT_IDS.sync_status} data-variant={state}>
      <StatusBadge label={SYNC_STATE_LABEL[state]} tone={SYNC_STATE_TONE[state]} icon={iconBySync[state]} />
    </span>
  );
}
