import type { ReactNode } from 'react';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { IconButton } from '../primitives/IconButton';

export function BottomSheet({ open, title, onClose, children }: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return <div className="ilka-sheet-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="ilka-bottom-sheet" data-ui-id={COMPONENT_IDS.bottom_sheet} role="dialog" aria-modal="true"
      aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
      <header><h2>{title}</h2><IconButton icon="x" label="Закрыть" onClick={onClose} /></header>
      {children}
    </section>
  </div>;
}
