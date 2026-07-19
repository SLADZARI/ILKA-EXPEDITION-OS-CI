import type { GamificationView } from '../../contracts/generated/gamification-view';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { ProgressBar } from '../primitives/ProgressBar';
import { XPBadge } from './XPBadge';

type Mastery = GamificationView['role_mastery'][number];
export function XPEntryRow({ mastery, syncState }: { mastery: Mastery; syncState: GamificationView['sync_state'] }) {
  const max = mastery.next_level_xp ?? Math.max(mastery.xp, 1);
  return <article className="ilka-row" data-ui-id={COMPONENT_IDS.xp_entry_row} data-state={mastery.level}>
    <div className="ilka-row__body"><h3>{mastery.role_id}</h3><p>Level: {mastery.level}</p>
      <ProgressBar value={mastery.xp} max={max} label={`${mastery.xp} / ${max}`} />
    </div>
    <div className="ilka-row__status"><XPBadge xp={mastery.xp} state={syncState} /></div>
  </article>;
}
