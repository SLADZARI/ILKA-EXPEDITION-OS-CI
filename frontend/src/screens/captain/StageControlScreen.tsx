import { useState } from 'react';
import type { CaptainDayView } from '../../contracts/generated/captain-day-view';
import type { CommandContext } from '../../application/commands/createCommand';
import type { CommandDispatcher } from '../../application/commands/CommandDispatcher';
import { createStageAdvance, createStageAdvanceOverride } from '../../application/commands/stageAdvance';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { ScreenHeader } from '../../components/primitives/ScreenHeader';
import { StageCard } from '../../components/stage/StageCard';
import { StagePath, type StagePathItem } from '../../components/stage/StagePath';
import { BlockerPanel } from '../../components/system/BlockerPanel';
import { Button } from '../../components/primitives/Button';
import { BottomSheet } from '../../components/overlays/BottomSheet';
import { StatusBadge } from '../../components/primitives/StatusBadge';

export function StageControlScreen({ data, stages, dispatcher, context }: {
  data: CaptainDayView;
  stages: StagePathItem[];
  dispatcher: CommandDispatcher;
  context: CommandContext;
}) {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const target = data.stage.next_stage_id;
  const advance = async () => {
    if (!target || !data.stage.can_advance || !data.controls.advance_stage) return;
    const command = createStageAdvance({ from_stage_id: data.stage.stage_id, to_stage_id: target,
      effective_from_day_number: data.day.number + 1 }, context);
    const response = await dispatcher.dispatchServer(command); setResult(`${response.state}: ${command.command_id}`);
  };
  const override = async () => {
    if (!target || !reason.trim() || !data.controls.override_stage_advance) return;
    const command = createStageAdvanceOverride({ from_stage_id: data.stage.stage_id, to_stage_id: target,
      effective_from_day_number: data.day.number + 1, reason: reason.trim(),
      unmet_conditions: (data.stage.advance_blockers ?? []).map((item) => item.code) }, context);
    const response = await dispatcher.dispatchServer(command); setResult(`${response.state}: ${command.command_id}`); setOverrideOpen(false);
  };
  return <div data-ui-id={COMPONENT_IDS.screen_captain_stage_control}>
    <ScreenHeader eyebrow="ADR-006 · PRODUCT STAGE" title="Stage Control" sync={data.sync_status} />
    {result && <StatusBadge label={`Server command: ${result}`} tone={result.startsWith('synced') ? 'success' : 'sync_pending'} />}
    <StageCard stage={data.stage} />
    <BlockerPanel blockers={(data.stage.advance_blockers ?? []).map((blocker) => ({ ...blocker, entity_id: data.stage.stage_id }))} />
    <div className="ilka-card-actions">
      <Button disabled={!data.stage.can_advance || !data.controls.advance_stage || !target} onClick={advance}>Advance to {target ?? '—'}</Button>
      <Button variant="destructive" disabled={!data.controls.override_stage_advance || !target} onClick={() => setOverrideOpen(true)}>Override Stage</Button>
    </div>
    <StagePath stages={stages} />
    <BottomSheet open={overrideOpen} title="Override Product Stage" onClose={() => setOverrideOpen(false)}>
      <label htmlFor="override-reason">Reason</label>
      <textarea id="override-reason" value={reason} onChange={(event: { target: { value: string } }) => setReason(event.target.value)} rows={4} />
      <Button variant="destructive" disabled={reason.trim().length < 3} onClick={override}>Submit override</Button>
    </BottomSheet>
  </div>;
}
