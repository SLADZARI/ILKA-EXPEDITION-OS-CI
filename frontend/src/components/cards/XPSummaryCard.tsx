import type { GamificationView } from '../../contracts/generated/gamification-view';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { CardShell } from './CardShell';

export function XPSummaryCard({ data }: { data: GamificationView }) {
  return <CardShell id={COMPONENT_IDS.xp_summary_card} state={data.sync_state}>
    <p className="ilka-eyebrow">ROLE XP · RULES V{data.rules_version}</p><h2>Role mastery</h2>
    <div className="ilka-metric"><strong>{data.role_mastery.length}</strong><span>roles</span></div>
    <p className="ilka-card-caption">Per-role balances are rendered exactly from the Engine projection. The UI does not calculate an aggregate XP balance.</p>
  </CardShell>;
}
