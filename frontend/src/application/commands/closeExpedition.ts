import type { CommandContext } from './createCommand';
import { createCommand } from './createCommand';

export type CloseExpeditionInput = {
  shore_package_ref: string;
  completion_summary: string;
  expected_projection_version: number;
};

export function createCloseExpeditionCommand(input: CloseExpeditionInput, context: CommandContext) {
  return createCommand('close_expedition', {
    final_stage_id: 'demo_day',
    final_day_number: 12,
    shore_package_ref: input.shore_package_ref,
    completion_summary: input.completion_summary,
    expected_projection_version: input.expected_projection_version,
  }, {
    ...context,
    day_number: 12,
    stage_id: 'demo_day',
  });
}
