import type {
  advance_stagePayload,
  override_stage_advancePayload,
  request_stage_advancePayload,
} from '../../contracts/generated/command';
import { createCommand, type CommandContext } from './createCommand';

export const createStageAdvanceRequest = (payload: request_stage_advancePayload, context: CommandContext) =>
  createCommand('request_stage_advance', payload, context);
export const createStageAdvance = (payload: advance_stagePayload, context: CommandContext) =>
  createCommand('advance_stage', payload, context);
export const createStageAdvanceOverride = (payload: override_stage_advancePayload, context: CommandContext) =>
  createCommand('override_stage_advance', payload, context);
