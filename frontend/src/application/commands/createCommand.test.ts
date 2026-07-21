import { describe, expect, it } from 'vitest';
import { createCompleteTaskCommand } from './task';

describe('createCommand', () => {
  it('uses command_id as the canonical idempotency key', () => {
    const command = createCompleteTaskCommand('task_team_agreement', {
      actor_id: 'participant_01',
      actor_role: 'participant',
      expedition_id: 'ilka_demo_2026_01',
      day_number: 1,
      stage_id: 'onboarding',
    });

    expect(command.command_id).toMatch(/^cmd_/);
    expect(command.idempotency_key).toBe(command.command_id);
  });
});
