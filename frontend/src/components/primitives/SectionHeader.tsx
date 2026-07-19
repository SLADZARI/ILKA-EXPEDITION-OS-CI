import type { ReactNode } from 'react';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="ilka-section-header" data-ui-id={COMPONENT_IDS.section_header}>
      <h2>{title}</h2>
      {action}
    </div>
  );
}
