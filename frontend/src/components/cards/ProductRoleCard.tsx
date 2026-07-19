import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import type { Assignment } from '../../contracts/status-maps';
import { ASSIGNMENT_STATE_LABEL, ASSIGNMENT_STATE_TONE } from '../../contracts/status-maps';
import { StatusBadge } from '../primitives/StatusBadge';
import { Icon } from '../primitives/Icon';
import { CardShell } from './CardShell';

export function ProductRoleCard({ assignment }: { assignment: Assignment }) {
  const state = assignment.state ?? 'scheduled';
  return (
    <CardShell id={COMPONENT_IDS.product_role_card} variant="hero" state={state} className="ilka-role-card ilka-role-card--product">
      <div className="ilka-role-card__icon"><Icon name="compass" size={54} /></div>
      <p className="ilka-eyebrow ilka-eyebrow--inverse">PRODUCT ROLE</p>
      <h2>{assignment.title ?? assignment.role_id ?? 'Product role'}</h2>
      <p className="ilka-card-caption">Обязанности открываются из назначенной role card.</p>
      <StatusBadge label={ASSIGNMENT_STATE_LABEL[state]} tone={ASSIGNMENT_STATE_TONE[state]} />
    </CardShell>
  );
}
