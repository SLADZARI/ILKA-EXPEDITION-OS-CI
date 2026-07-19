import { COMPONENT_IDS } from '../../design-system/generated/component-ids';

export type StagePathItem = { stage_id: string; title: string; status: 'locked' | 'available' | 'active' | 'completed' };
export function StagePath({ stages }: { stages: StagePathItem[] }) {
  return <ol className="ilka-stage-path" data-ui-id={COMPONENT_IDS.stage_path}>
    {stages.map((stage, index) => <li key={stage.stage_id} data-state={stage.status}>
      <span className="ilka-stage-path__index">{index + 1}</span><span><strong>{stage.title}</strong><small>{stage.status}</small></span>
    </li>)}
  </ol>;
}
