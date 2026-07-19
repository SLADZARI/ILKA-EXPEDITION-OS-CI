import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { StatusBadge } from '../primitives/StatusBadge';

export function VoteResultBanner({ status, selectedOptionId, ballotCount, abstentionCount }: {
  status: 'none' | 'draft' | 'vote_open' | 'finalized' | 'overridden';
  selectedOptionId?: string | null;
  ballotCount?: number;
  abstentionCount?: number;
}) {
  if (status === 'none' || status === 'draft') return null;
  const complete = status === 'finalized' || status === 'overridden';
  return <div className="ilka-vote-result" data-ui-id={COMPONENT_IDS.vote_result_banner} data-state={status}>
    <StatusBadge label={status.replace('_', ' ')} tone={complete ? 'success' : 'info'} />
    {selectedOptionId && <strong>Selected: {selectedOptionId}</strong>}
    {ballotCount !== undefined && <span>{ballotCount} ballots · {abstentionCount ?? 0} abstentions</span>}
  </div>;
}
