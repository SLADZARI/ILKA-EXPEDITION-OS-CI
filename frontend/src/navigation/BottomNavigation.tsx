import { COMPONENT_IDS } from '../design-system/generated/component-ids';
import { Icon } from '../components/primitives/Icon';

export type NavigationItem = { id: string; label: string; icon: string; hidden?: boolean };

export function BottomNavigation({ items, activeId, onNavigate }: {
  items: NavigationItem[];
  activeId: string;
  onNavigate: (id: string) => void;
}) {
  const visible = items.filter((item) => !item.hidden);
  return (
    <nav className="ilka-bottom-nav" data-ui-id={COMPONENT_IDS.bottom_navigation} aria-label="Основная навигация">
      {visible.map((item) => (
        <button key={item.id} type="button" className="ilka-bottom-nav__item"
          data-active={item.id === activeId} aria-current={item.id === activeId ? 'page' : undefined}
          onClick={() => onNavigate(item.id)}>
          <Icon name={item.icon} size={20} /><span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
