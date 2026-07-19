import type { activate_recovery_dayPayload } from '../../contracts/generated/command';
import { createCommand, type CommandContext } from './createCommand';

export const createActivateRecoveryDayCommand = (
  payload: activate_recovery_dayPayload,
  context: CommandContext,
) => createCommand('activate_recovery_day', payload, context);
