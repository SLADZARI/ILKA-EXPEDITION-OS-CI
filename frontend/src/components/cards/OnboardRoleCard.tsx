import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import type { Assignment } from '../../contracts/status-maps';
import { ASSIGNMENT_STATE_LABEL, ASSIGNMENT_STATE_TONE } from '../../contracts/status-maps';
import { StatusBadge } from '../primitives/StatusBadge';
import { Icon } from '../primitives/Icon';
import { CardShell } from './CardShell';

export function OnboardRoleCard({ assignment }: { assignment: Assignment }) {
  const state = assignment.state ?? 'scheduled';
  return (
    <CardShell id={COMPONENT_IDS.onboard_role_card} state={state} className="ilka-role-card ilka-role-card--onboard">
      <div className="ilka-card-icon"><Icon name="anchor" /></div>
      <p className="ilka-eyebrow">ONBOARD ROLE</p>
      <h3>{assignment.title ?? assignment.role_id ?? 'Onboard role'}</h3>
      <p className="ilka-card-caption">Captain и safety instructions имеют приоритет.</p>
      <StatusBadge label={ASSIGNMENT_STATE_LABEL[state]} tone={ASSIGNMENT_STATE_TONE[state]} />
    </CardShell>
  );
}
