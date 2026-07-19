import type { TodayView } from '../../contracts/generated/today-view';
import { SectionHeader } from '../primitives/SectionHeader';
import { ContributionRatingCard } from '../cards/ContributionRatingCard';
import { RoleMasteryCard } from '../cards/RoleMasteryCard';

type TodayGamification = NonNullable<TodayView['gamification']>;

export function GamificationSummarySection({ data }: { data: TodayGamification }) {
  const syncState = data.xp_state;
  return (
    <section>
      <SectionHeader title="Role XP и вклад" />
      <div className="ilka-card-grid">
        <ContributionRatingCard contribution={data.contribution} rulesVersion={data.rules_version} syncState={syncState} />
        {data.role_mastery.slice(0, 2).map((mastery) => (
          <RoleMasteryCard key={mastery.role_id} mastery={mastery} syncState={syncState} />
        ))}
      </div>
    </section>
  );
}
