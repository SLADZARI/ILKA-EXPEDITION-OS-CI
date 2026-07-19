import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { StatusBadge } from '../primitives/StatusBadge';

export function XPBadge({ xp, state }: { xp: number; state: 'provisional' | 'synced' | 'conflict' | 'rejected' }) {
  return <span data-ui-id={COMPONENT_IDS.xp_badge} data-state={state}>
    <StatusBadge label={`${xp} XP${state === 'provisional' ? ' provisional' : ''}`}
      tone={state === 'conflict' || state === 'rejected' ? 'critical' : state === 'provisional' ? 'warning' : 'success'} />
  </span>;
}
