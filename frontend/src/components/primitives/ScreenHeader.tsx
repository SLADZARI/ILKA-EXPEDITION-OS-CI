import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import type { SyncState } from '../../contracts/status-maps';
import { SyncStatus } from './StatusBadge';

export function BrandLockup() {
  return (
    <div className="ilka-brand" data-ui-id={COMPONENT_IDS.brand_lockup}>
      <span className="ilka-brand__mark">≈</span>
      <span><strong>ILKA</strong><small>EXPEDITION OS</small></span>
    </div>
  );
}

export function ScreenHeader({ eyebrow, title, sync }: { eyebrow: string; title: string; sync?: SyncState }) {
  return (
    <header className="ilka-screen-header" data-ui-id={COMPONENT_IDS.screen_header}>
      <div className="ilka-screen-header__top"><BrandLockup />{sync && <SyncStatus state={sync} />}</div>
      <p className="ilka-eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
    </header>
  );
}
