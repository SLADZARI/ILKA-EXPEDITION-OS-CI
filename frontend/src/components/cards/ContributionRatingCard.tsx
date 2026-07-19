import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import type { ContributionRating, GamificationSyncState } from '../../contracts/status-maps';
import { GAMIFICATION_SYNC_LABEL, GAMIFICATION_SYNC_TONE } from '../../contracts/status-maps';
import { StatusBadge } from '../primitives/StatusBadge';
import { CardShell } from './CardShell';

export function ContributionRatingCard({ contribution, rulesVersion, syncState }:
  { contribution: ContributionRating; rulesVersion: number; syncState: GamificationSyncState }) {
  const timestamp = new Date(contribution.snapshot_at).toLocaleString('ru-RU');
  return (
    <CardShell id={COMPONENT_IDS.contribution_rating_card} state={contribution.status} className="ilka-contribution-card">
      <p className="ilka-eyebrow">EXPEDITION CONTRIBUTION</p>
      <div className="ilka-rating-grid">
        <div><strong>{contribution.score}</strong><span>score / 100</span></div>
        <div><strong>{contribution.rank ?? '—'}</strong><span>rank</span></div>
      </div>
      <div className="ilka-badge-row">
        <StatusBadge label={contribution.status} tone={contribution.status === 'active' ? 'success' : 'neutral'} />
        <StatusBadge label={GAMIFICATION_SYNC_LABEL[syncState]} tone={GAMIFICATION_SYNC_TONE[syncState]} />
      </div>
      <p className="ilka-card-caption">Rules v{rulesVersion} · Snapshot {timestamp}</p>
    </CardShell>
  );
}
