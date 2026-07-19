import type { ReactNode } from 'react';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { CardShell } from './CardShell';

export function MiniCard({ title, caption, icon, children }: { title: string; caption?: string; icon?: ReactNode; children?: ReactNode }) {
  return <CardShell id={COMPONENT_IDS.mini_card} variant="compact" className="ilka-mini-card">
    {icon}<h3>{title}</h3>{caption && <p className="ilka-card-caption">{caption}</p>}{children}
  </CardShell>;
}
