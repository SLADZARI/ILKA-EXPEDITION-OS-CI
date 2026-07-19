import type { ReactNode } from 'react';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';

export function CardShell({ id = COMPONENT_IDS.card_shell, variant = 'standard', state = 'available', className = '', children }:
  { id?: string; variant?: 'hero' | 'standard' | 'compact'; state?: string; className?: string; children: ReactNode }) {
  return <article className={`ilka-card ilka-card--${variant} ${className}`.trim()} data-ui-id={id}
    data-variant={variant} data-state={state}>{children}</article>;
}
