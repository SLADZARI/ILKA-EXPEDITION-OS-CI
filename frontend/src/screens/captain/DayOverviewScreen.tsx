import { useState } from 'react';
import type { CaptainDayView } from '../../contracts/generated/captain-day-view';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { ScreenHeader } from '../../components/primitives/ScreenHeader';
import { SectionHeader } from '../../components/primitives/SectionHeader';
import { ParticipantAssignmentRow } from '../../components/captain/ParticipantAssignmentRow';
import { CaptainControlPanel, type CaptainAction } from '../../components/captain/CaptainControlPanel';
import { BlockerPanel } from '../../components/system/BlockerPanel';
import { StageCard } from '../../components/stage/StageCard';
import { DecisionCard } from '../../components/decision/DecisionCard';
import { ContributionRatingCard } from '../../components/cards/ContributionRatingCard';

export function DayOverviewScreen({ data, onAction }: {
  data: CaptainDayView;
  onAction: (action: CaptainAction, completionSummary?: string) => void;
}) {
  const firstRating = data.gamification_summary?.entries[0];
  const [completionSummary, setCompletionSummary] = useState('');
  const readiness = data.completion_readiness;
  const completed = data.expedition_completion;
  return <div data-ui-id={COMPONENT_IDS.screen_captain_day_overview}>
    <ScreenHeader eyebrow={`${data.local_date} · Day ${data.day.number}`} title="Captain Console" sync={data.sync_status} />
    <StageCard stage={data.stage} />
    <BlockerPanel blockers={data.blockers} title="Day close blockers" />
    <BlockerPanel blockers={(data.stage.advance_blockers ?? []).map((blocker) => ({ ...blocker, entity_id: data.stage.stage_id }))} title="Stage advance blockers" />
    <section><SectionHeader title="Участники и назначения" /><div className="ilka-list">
      {data.participants.map((participant) => <ParticipantAssignmentRow key={participant.participant_id} participant={participant} />)}
    </div></section>
    <section><SectionHeader title="Product Decision" /><DecisionCard decision={data.decision} /></section>
    {firstRating && data.gamification_summary && <section><SectionHeader title="Expedition Rating snapshot" />
      <ContributionRatingCard contribution={{ score: firstRating.score, rank: firstRating.rank, status: firstRating.status,
        snapshot_at: data.gamification_summary.snapshot_at }} rulesVersion={data.gamification_summary.rules_version} syncState="synced" />
    </section>}
    <section>
      <SectionHeader title="Expedition completion" />
      <div className="ilka-card">
        <p><strong>Status:</strong> {data.expedition_status}</p>
        <p><strong>Readiness:</strong> {readiness.state}</p>
        {readiness.shore_package_ref && <p><strong>Shore Package:</strong> {readiness.shore_package_ref}</p>}
        {completed && <><p><strong>Completed:</strong> {completed.completed_at}</p><p>{completed.completion_summary}</p></>}
        {readiness.state !== 'completed' && <label>Completion summary
          <textarea value={completionSummary} onChange={(event: { target: { value: string } }) => setCompletionSummary(event.target.value)}
            disabled={!readiness.can_close_expedition} />
        </label>}
      </div>
      <BlockerPanel blockers={readiness.blockers.map((blocker) => ({ ...blocker, entity_id: blocker.entity_id ?? data.expedition_id }))}
        title="Expedition completion blockers" />
    </section>
    <section><SectionHeader title="Captain controls" /><CaptainControlPanel controls={data.controls}
      onAction={(action) => onAction(action, action === 'close_expedition' ? completionSummary : undefined)} /></section>
  </div>;
}
