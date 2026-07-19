import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import type { RoleMastery, GamificationSyncState } from '../../contracts/status-maps';
import { GAMIFICATION_SYNC_LABEL, GAMIFICATION_SYNC_TONE } from '../../contracts/status-maps';
import { StatusBadge } from '../primitives/StatusBadge';
import { CardShell } from './CardShell';

const presentRoleId = (roleId: string) => roleId.split('_').map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ');

export function RoleMasteryCard({ mastery, syncState }: { mastery: RoleMastery; syncState: GamificationSyncState }) {
  return (
    <CardShell id={COMPONENT_IDS.role_mastery_card} state={syncState} className="ilka-mastery-card">
      <p className="ilka-eyebrow">ROLE MASTERY</p>
      <h3>{presentRoleId(mastery.role_id)}</h3>
      <div className="ilka-metric"><strong>{mastery.xp}</strong><span>XP</span></div>
      <div className="ilka-badge-row">
        <StatusBadge label={mastery.level} tone="info" />
        <StatusBadge label={GAMIFICATION_SYNC_LABEL[syncState]} tone={GAMIFICATION_SYNC_TONE[syncState]} />
      </div>
      {mastery.next_level_xp !== null && mastery.next_level_xp !== undefined && (
        <p className="ilka-card-caption">Next level threshold: {mastery.next_level_xp} XP</p>
      )}
    </CardShell>
  );
}
