import { useState } from 'react';
import type { CaptainDayView } from '../../contracts/generated/captain-day-view';
import type { CommandContext } from '../../application/commands/createCommand';
import type { CommandDispatcher } from '../../application/commands/CommandDispatcher';
import { createActivateRecoveryDayCommand } from '../../application/commands/activateRecoveryDay';
import { COMPONENT_IDS } from '../../design-system/generated/component-ids';
import { ScreenHeader } from '../../components/primitives/ScreenHeader';
import { RecoveryDayCard } from '../../components/recovery/RecoveryDayCard';
import { RecoveryDayActivation } from '../../components/recovery/RecoveryDayActivation';
import { CaptainAlert } from '../../components/system/CaptainAlert';
import { StatusBadge } from '../../components/primitives/StatusBadge';

export function RecoveryDayScreen({ data, dispatcher, context }: {
  data: CaptainDayView;
  dispatcher: CommandDispatcher;
  context: CommandContext;
}) {
  const [result, setResult] = useState<string | null>(null);
  const activate = async (reason: string) => {
    const command = createActivateRecoveryDayCommand({ local_calendar_date: data.local_date, reason }, context);
    const response = await dispatcher.dispatchServer(command); setResult(`${response.state}: ${command.command_id}`);
  };
  return <div data-ui-id={COMPONENT_IDS.screen_captain_recovery_day}>
    <ScreenHeader eyebrow="CAPTAIN EXCEPTION CONTROL" title="Recovery Day" sync={data.sync_status} />
    <CaptainAlert title="Safety and actual vessel situation have priority" tone="info">
      Recovery Day changes Product Stage scheduling only through the canonical command and append-only event.
    </CaptainAlert>
    {result && <StatusBadge label={`Server command: ${result}`} tone={result.startsWith('synced') ? 'success' : 'sync_pending'} />}
    <RecoveryDayCard available={data.controls.activate_recovery_day} localDate={data.local_date} />
    <RecoveryDayActivation enabled={data.controls.activate_recovery_day} localDate={data.local_date} onActivate={activate} />
  </div>;
}
