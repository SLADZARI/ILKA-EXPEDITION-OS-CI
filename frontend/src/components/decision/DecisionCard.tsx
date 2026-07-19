import type { CaptainDayView } from '../../contracts/generated/captain-day-view';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { CardShell } from '../cards/CardShell';
import { EmptyState } from '../system/EmptyState';
import { VoteResultBanner } from './VoteResultBanner';

type Decision = NonNullable<CaptainDayView['decision']>;
export function DecisionCard({ decision }: { decision?: Decision | null }) {
  if (!decision || decision.status === 'none') return <EmptyState title="Product Decision не открыт" description="Состояние появится после создания decision draft." />;
  return <CardShell id={COMPONENT_IDS.decision_card} state={decision.status}>
    <p className="ilka-eyebrow">ADR-008</p><h3>{decision.decision_id ?? 'Product Decision'}</h3>
    <p className="ilka-card-caption">Vote: {decision.vote_id ?? 'not created'} · round {decision.round_version ?? '—'}</p>
    <VoteResultBanner status={decision.status} selectedOptionId={decision.selected_option_id}
      ballotCount={decision.effective_ballot_count} abstentionCount={decision.abstention_count} />
  </CardShell>;
}
