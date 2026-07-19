import type { ReactNode } from 'react';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { Icon } from '../primitives/Icon';

export function CaptainAlert({ title, children, tone = 'critical' }: {
  title: string;
  children: ReactNode;
  tone?: 'critical' | 'warning' | 'info';
}) {
  return <aside className={`ilka-alert-panel ilka-alert-panel--${tone}`} data-ui-id={COMPONENT_IDS.captain_alert}>
    <div className="ilka-alert-panel__title"><Icon name={tone === 'critical' ? 'alert' : 'flag'} /><h3>{title}</h3></div>
    <div className="ilka-alert-panel__body">{children}</div>
  </aside>;
}
