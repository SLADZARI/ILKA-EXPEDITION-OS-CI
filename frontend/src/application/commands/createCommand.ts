import type {
  ActorRole,
  Command,
  CommandEnvelopeBase,
  CommandPayloadByType,
  CommandType,
} from '../../contracts/generated/command';

export type CommandContext = Pick<
  CommandEnvelopeBase,
  'actor_id' | 'actor_role' | 'expedition_id'
> & Partial<Pick<CommandEnvelopeBase, 'day_number' | 'stage_id' | 'device_id' | 'day_revision'>>;

function randomId(prefix: string): string {
  const value = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${value}`;
}

export function createCommand<K extends CommandType>(
  commandType: K,
  payload: CommandPayloadByType[K],
  context: CommandContext,
): Extract<Command, { command_type: K }> {
  const commandId = randomId('cmd');
  const issuedAt = new Date().toISOString();
  return {
    command_id: commandId,
    command_type: commandType,
    issued_at: issuedAt,
    actor_id: context.actor_id,
    actor_role: context.actor_role as ActorRole,
    expedition_id: context.expedition_id,
    idempotency_key: `${context.expedition_id}:${commandType}:${commandId}`,
    day_number: context.day_number ?? null,
    stage_id: context.stage_id ?? null,
    device_id: context.device_id ?? null,
    day_revision: context.day_revision ?? null,
    payload,
  } as Extract<Command, { command_type: K }>;
}
