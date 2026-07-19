import type { CaptainDayView } from '../../contracts/generated/captain-day-view';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { Button } from '../primitives/Button';

type Controls = CaptainDayView['controls'];
export type CaptainAction = 'advance_stage' | 'override_stage_advance' | 'activate_recovery_day' | 'close_day' | 'override_day_close' | 'recover_day_transition' | 'close_expedition';
export function CaptainControlPanel({ controls, onAction }: { controls: Controls; onAction: (action: CaptainAction) => void }) {
  const items: Array<{ id: CaptainAction; label: string; enabled: boolean; destructive?: boolean }> = [
    { id: 'advance_stage', label: 'Advance Stage', enabled: controls.advance_stage },
    { id: 'override_stage_advance', label: 'Override Stage', enabled: controls.override_stage_advance, destructive: true },
    { id: 'activate_recovery_day', label: 'Recovery Day', enabled: controls.activate_recovery_day },
    { id: 'close_day', label: 'Close Day', enabled: true },
    { id: 'override_day_close', label: 'Override Close', enabled: controls.override_day_close, destructive: true },
    { id: 'recover_day_transition', label: 'Recover Transition', enabled: controls.recover_day_transition },
    { id: 'close_expedition', label: 'Close Expedition', enabled: controls.close_expedition, destructive: true },
  ];
  return <section className="ilka-control-panel" data-ui-id={COMPONENT_IDS.captain_control_panel}>
    {items.map((item) => <Button key={item.id} disabled={!item.enabled}
      variant={item.destructive ? 'destructive' : item.id === 'advance_stage' ? 'primary' : 'secondary'}
      onClick={() => onAction(item.id)}>{item.label}</Button>)}
  </section>;
}
