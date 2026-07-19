import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { Icon } from '../primitives/Icon';

type Blocker = { code: string; message: string; entity_id?: string };
export function BlockerPanel({ blockers, title = 'Блокирующие условия' }: { blockers: Blocker[]; title?: string }) {
  if (blockers.length === 0) return null;
  return <section className="ilka-alert-panel ilka-alert-panel--warning" data-ui-id={COMPONENT_IDS.blocker_panel}>
    <div className="ilka-alert-panel__title"><Icon name="alert" /><h3>{title}</h3></div>
    <ul>{blockers.map((blocker) => <li key={`${blocker.code}:${blocker.entity_id ?? ''}`}>
      <strong>{blocker.code}</strong><span>{blocker.message}</span>
    </li>)}</ul>
  </section>;
}
