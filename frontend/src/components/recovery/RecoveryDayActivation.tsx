import { useState } from 'react';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { Button } from '../primitives/Button';

export function RecoveryDayActivation({ enabled, localDate, onActivate }: {
  enabled: boolean;
  localDate: string;
  onActivate: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const submit = async () => {
    if (!enabled || reason.trim().length < 3) return;
    setPending(true);
    try { await onActivate(reason.trim()); setReason(''); } finally { setPending(false); }
  };
  return <section className="ilka-form-card" data-ui-id={COMPONENT_IDS.recovery_day_activation}>
    <label htmlFor="recovery-reason">Причина активации на {localDate}</label>
    <textarea id="recovery-reason" value={reason} onChange={(event) => setReason(event.target.value)}
      placeholder="Operational reason required by canonical command" rows={4} />
    <Button disabled={!enabled || pending || reason.trim().length < 3} onClick={submit}>
      {pending ? 'Queued…' : 'Активировать Recovery Day'}
    </Button>
  </section>;
}
