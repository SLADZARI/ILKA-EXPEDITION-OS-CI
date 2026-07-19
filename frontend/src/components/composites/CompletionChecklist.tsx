import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { StatusBadge } from '../primitives/StatusBadge';

export type ChecklistItem = { id: string; title: string; complete: boolean; blocked?: boolean };
export function CompletionChecklist({ items }: { items: ChecklistItem[] }) {
  return <div className="ilka-checklist" data-ui-id={COMPONENT_IDS.completion_checklist}>
    {items.map((item) => <div className="ilka-checklist__item" key={item.id} data-state={item.blocked ? 'blocked' : item.complete ? 'complete' : 'open'}>
      <span>{item.title}</span>
      <StatusBadge label={item.blocked ? 'Blocked' : item.complete ? 'Complete' : 'Open'}
        tone={item.blocked ? 'warning' : item.complete ? 'success' : 'neutral'} />
    </div>)}
  </div>;
}
