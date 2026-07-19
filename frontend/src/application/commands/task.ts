import type { CommandContext } from './createCommand';
import { createCommand } from './createCommand';

export const createAcknowledgeCardCommand = (cardId: string, context: CommandContext) =>
  createCommand('acknowledge_card', { card_id: cardId }, context);
export const createStartTaskCommand = (taskId: string, context: CommandContext) =>
  createCommand('start_task', { task_id: taskId }, context);
export const createCompleteTaskCommand = (taskId: string, context: CommandContext) =>
  createCommand('complete_task', { task_id: taskId }, context);
