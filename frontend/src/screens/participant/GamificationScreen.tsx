import type { GamificationView } from '../../contracts/generated/gamification-view';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { ScreenHeader } from '../../components/primitives/ScreenHeader';
import { SectionHeader } from '../../components/primitives/SectionHeader';
import { XPSummaryCard } from '../../components/cards/XPSummaryCard';
import { ContributionRatingCard } from '../../components/cards/ContributionRatingCard';
import { RoleMasteryCard } from '../../components/cards/RoleMasteryCard';

export function GamificationScreen({ data }: { data: GamificationView }) {
  return <div data-ui-id={COMPONENT_IDS.screen_participant_gamification}>
    <ScreenHeader eyebrow={`Rules v${data.rules_version}`} title="Role XP и Expedition Rating" />
    <XPSummaryCard data={data} />
    <ContributionRatingCard contribution={data.contribution} rulesVersion={data.rules_version} syncState={data.sync_state} />
    <section><SectionHeader title="Освоение ролей" /><div className="ilka-card-grid">
      {data.role_mastery.map((mastery) => <RoleMasteryCard key={mastery.role_id} mastery={mastery} syncState={data.sync_state} />)}
    </div></section>
  </div>;
}
