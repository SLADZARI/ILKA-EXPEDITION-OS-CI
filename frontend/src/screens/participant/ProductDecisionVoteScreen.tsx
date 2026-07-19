import { useMemo, useState } from 'react';
import type { TodayView } from '../../contracts/generated/today-view';
import type { CommandContext } from '../../application/commands/createCommand';
import { createVoteCommand } from '../../application/commands/vote';
import type { CommandDispatcher } from '../../application/commands/CommandDispatcher';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { ScreenHeader } from '../../components/primitives/ScreenHeader';
import { VoteCard } from '../../components/decision/VoteCard';
import { EmptyState } from '../../components/system/EmptyState';
import { StatusBadge } from '../../components/primitives/StatusBadge';

export function ProductDecisionVoteScreen({ data, dispatcher, context }: {
  data: TodayView;
  dispatcher: CommandDispatcher;
  context: CommandContext;
}) {
  const vote = data.decision_vote;
  const initial = vote?.my_choice ?? null;
  const [selected, setSelected] = useState<string | null>(initial);
  const [queued, setQueued] = useState(false);
  const nextRevision = useMemo(() => (vote?.my_ballot_revision ?? 0) + 1, [vote?.my_ballot_revision]);
  if (!vote || vote.status === 'none') return <EmptyState title="Голосование не открыто" description="Product Decision vote появится из authoritative projection." />;
  const submit = async () => {
    if (!vote.vote_id || !selected) return;
    setQueued(true);
    await dispatcher.dispatch(createVoteCommand({ vote_id: vote.vote_id, choice: selected, ballot_revision: nextRevision }, context));
  };
  return <div data-ui-id={COMPONENT_IDS.screen_participant_vote}>
    <ScreenHeader eyebrow="ADR-008 · PRODUCT DECISION" title="Ваш голос" sync={data.sync_status} />
    {queued && <StatusBadge label="Vote queued offline" tone="sync_pending" icon="clock" />}
    <VoteCard vote={vote} selectedOptionId={selected} onSelect={setSelected} onSubmit={submit} submitting={queued} />
  </div>;
}
