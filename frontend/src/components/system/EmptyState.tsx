import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { Icon } from '../primitives/Icon';

export function EmptyState({ title, description, icon = 'cards' }: { title: string; description?: string; icon?: string }) {
  return <div className="ilka-empty-state" data-ui-id={COMPONENT_IDS.empty_state}>
    <Icon name={icon} size={28} /><h3>{title}</h3>{description && <p>{description}</p>}
  </div>;
}
