import type { votePayload } from '../../contracts/generated/command';
import { createCommand, type CommandContext } from './createCommand';

export function createVoteCommand(payload: votePayload, context: CommandContext) {
  return createCommand('vote', payload, context);
}
