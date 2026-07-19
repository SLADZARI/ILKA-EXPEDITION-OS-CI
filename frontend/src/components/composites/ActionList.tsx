import { COMPONENT_IDS } from '../../design-system/generated/component-ids';

export function ActionList({ items, ordered = true }: { items: string[]; ordered?: boolean }) {
  const Tag = ordered ? 'ol' : 'ul';
  return <Tag className="ilka-action-list" data-ui-id={COMPONENT_IDS.action_list}>
    {items.slice(0, 5).map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}
  </Tag>;
}
