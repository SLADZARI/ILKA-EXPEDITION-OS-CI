import type { GamificationView } from '../../contracts/generated/gamification-view';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { StatusBadge } from '../primitives/StatusBadge';

type Contribution = GamificationView['contribution'];
export function RatingIndicator({ contribution }: { contribution: Contribution }) {
  return <div className="ilka-rating-indicator" data-ui-id={COMPONENT_IDS.rating_indicator} data-state={contribution.status}>
    <strong>{contribution.score}</strong><span>/100</span>
    <StatusBadge label={contribution.status} tone={contribution.status === 'active' ? 'success' : 'neutral'} />
    <small>{contribution.rank ? `Rank ${contribution.rank}` : 'No rank'}</small>
  </div>;
}
