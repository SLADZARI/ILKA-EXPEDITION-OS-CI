import type { TodayView } from '../../contracts/generated/today-view';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { Button } from '../primitives/Button';
import { StatusBadge } from '../primitives/StatusBadge';
import { CardShell } from '../cards/CardShell';
import { BallotOption } from './BallotOption';

type DecisionVote = NonNullable<TodayView['decision_vote']>;
export function VoteCard({ vote, selectedOptionId, onSelect, onSubmit, submitting = false }: {
  vote: DecisionVote;
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
  onSubmit: () => void;
  submitting?: boolean;
}) {
  const open = vote.status === 'open' || vote.status === 'pending_sync';
  const canSubmit = Boolean(vote.eligible && vote.vote_id && selectedOptionId && open && !submitting);
  return <CardShell id={COMPONENT_IDS.vote_card} state={vote.status} className="ilka-vote-card">
    <div className="ilka-card-heading"><div><p className="ilka-eyebrow">PRODUCT DECISION</p><h2>Голосование</h2></div>
      <StatusBadge label={vote.status.replace('_', ' ')} tone={open ? 'info' : 'neutral'} />
    </div>
    {!vote.eligible && <p className="ilka-card-caption">Вы не входите в frozen electorate этого раунда.</p>}
    <div className="ilka-ballot-list">
      {(vote.options ?? []).map((option) => <BallotOption key={option.option_id} optionId={option.option_id}
        title={option.title} selected={selectedOptionId === option.option_id} disabled={!vote.eligible || !open}
        onSelect={onSelect} />)}
    </div>
    {vote.my_choice && <p className="ilka-card-caption">Текущий authoritative ballot: {vote.my_choice} · revision {vote.my_ballot_revision ?? 0}</p>}
    <Button disabled={!canSubmit} onClick={onSubmit}>{submitting ? 'Queued…' : vote.my_choice ? 'Обновить выбор' : 'Отправить голос'}</Button>
    {vote.pending_sync && <StatusBadge label="Pending sync" tone="sync_pending" icon="clock" />}
  </CardShell>;
}
