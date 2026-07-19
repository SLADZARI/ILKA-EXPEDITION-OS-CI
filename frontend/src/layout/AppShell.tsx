import type { ReactNode } from 'react';
import { COMPONENT_IDS } from '../design-system/generated/component-ids';
import { BottomNavigation, type NavigationItem } from '../navigation/BottomNavigation';

export function AppShell({ children, navigation, activeNavigationId, onNavigate, variant = 'participant' }: {
  children: ReactNode;
  navigation?: NavigationItem[];
  activeNavigationId?: string;
  onNavigate?: (id: string) => void;
  variant?: 'participant' | 'captain';
}) {
  return (
    <main className="ilka-app-shell" data-ui-id={COMPONENT_IDS.app_shell} data-variant={variant}>
      <div className="ilka-screen-content">{children}</div>
      {navigation && activeNavigationId && onNavigate && (
        <BottomNavigation items={navigation} activeId={activeNavigationId} onNavigate={onNavigate} />
      )}
    </main>
  );
}
