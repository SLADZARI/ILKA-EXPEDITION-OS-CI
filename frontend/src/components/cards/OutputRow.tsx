import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import type { Output } from '../../contracts/status-maps';
import { StatusBadge } from '../primitives/StatusBadge';
import { Icon } from '../primitives/Icon';

export function OutputRow({ output }: { output: Output }) {
  return (
    <article className="ilka-row" data-ui-id={COMPONENT_IDS.output_row} data-state={output.confirmed ? 'confirmed' : 'pending'}>
      <div className="ilka-row__icon"><Icon name={output.confirmed ? 'check' : 'flag'} /></div>
      <div className="ilka-row__body"><h3>{output.title}</h3><p>{output.required ? 'Required output' : 'Optional output'}</p></div>
      <div className="ilka-row__status">
        <StatusBadge label={output.confirmed ? 'Confirmed' : 'Not confirmed'} tone={output.confirmed ? 'success' : 'warning'} />
        {output.pending_sync && <StatusBadge label="Pending" tone="sync_pending" icon="clock" />}
      </div>
    </article>
  );
}
