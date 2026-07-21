import { assertEquals, assertExists } from "jsr:@std/assert@1.0.19";

import {
  createExpeditionInvitationRuntime,
  EXPEDITION_SETUP_VIEW_SCHEMA_ID,
} from "../../../_shared/engine-runtime/expedition-invitations-v1.ts";
import type {
  InvitationAcceptanceCandidate,
  InvitationActiveProfile,
  InvitationDatabase,
} from "../../../_shared/command-gateway/invitation-database.ts";
import { createInvitationExecutor } from "../../../_shared/command-gateway/invitation.ts";
import { StaticRuntimeRegistry } from "../../../_shared/command-gateway/runtime-registry.ts";
import { createSchemaValidator } from "../../../_shared/command-gateway/schema-validation.ts";
import type {
  CommandEnvelope,
  GatewayDatabase,
  GatewayExecutionContext,
  JsonValue,
  ProcessCommandResult,
} from "../../../_shared/command-gateway/types.ts";

const AUTH_USER_ID = "10000000-0000-0000-0000-000000000095";
const PROFILE_ID = "20000000-0000-0000-0000-000000000095";
const CAPTAIN_MEMBERSHIP_ID = "30000000-0000-0000-0000-000000000095";
const EXPEDITION_UUID = "50000000-0000-0000-0000-000000000095";
const RELEASE_ID = "60000000-0000-0000-0000-000000000095";
const INVITATION_UUID = "95000000-0000-0000-0000-000000000095";
const NEW_MEMBERSHIP_ID = "96000000-0000-0000-0000-000000000095";
const NEW_PARTICIPANT_ID = "97000000-0000-0000-0000-000000000095";

const release = {
  id: RELEASE_ID,
  release_key: "invitation_executor_test",
  git_commit_sha: "0000000000000000000000000000000000000095",
  rules_release: "engine_v11_invitation_executor_test",
  content_release: "invitation_executor_test_v1",
  reducer_version: "invitation_executor_test_v1",
};

const runtime = createExpeditionInvitationRuntime({
  ...release,
  team_size_min: 3,
  team_size_max: 5,
  invitation_ttl_hours: 168,
});

function captainActorId(): string {
  return `member_${CAPTAIN_MEMBERSHIP_ID.replaceAll("-", "")}`;
}

function command(
  type: "invite_participant" | "accept_invitation" | "revoke_invitation",
  overrides: Partial<CommandEnvelope> = {},
): CommandEnvelope {
  const payload = type === "invite_participant"
    ? { email: "Anna@Example.Test", invitation_token: "A".repeat(43) }
    : type === "accept_invitation"
    ? { invitation_token: "A".repeat(43), display_name: " Anna " }
    : {
      invitation_id: `invitation_${INVITATION_UUID.replaceAll("-", "")}`,
      reason: " Cannot join ",
    };
  return {
    command_id: `cmd_executor_${type}`,
    command_type: type,
    issued_at: "2026-07-21T19:00:00Z",
    actor_id: type === "accept_invitation" ? PROFILE_ID : captainActorId(),
    actor_role: type === "accept_invitation" ? "participant" : "captain",
    expedition_id: "invitation_executor_test",
    idempotency_key: `cmd_executor_${type}`,
    day_number: null,
    stage_id: null,
    day_revision: null,
    payload,
    ...overrides,
  };
}

function baseView(): Record<string, JsonValue> {
  return {
    expedition_id: "invitation_executor_test",
    expedition_status: "draft",
    team: {
      active_participant_count: 0,
      pending_invitation_count: 1,
      minimum: 3,
      maximum: 5,
      slots_remaining: 4,
    },
    participants: [],
    invitations: [{
      invitation_id: `invitation_${INVITATION_UUID.replaceAll("-", "")}`,
      email_hint: "a***@example.test",
      role: "participant",
      status: "pending",
      expires_at: "2026-07-28T19:00:00Z",
      accepted_participant_id: null,
    }],
    rotation: {
      status: "not_generated",
      rotation_id: null,
      rules_version: null,
      assignments: [],
    },
    readiness: {
      can_generate_rotation: false,
      can_start_expedition: false,
      blockers: [],
    },
    controls: {
      invite_participant: true,
      revoke_invitation: true,
      generate_rotation: false,
      start_expedition: false,
    },
    expected_projection_version: 1,
    sync_status: "synced",
  };
}

function context(
  actor: GatewayExecutionContext["actor"],
  projectionVersion = 0,
): GatewayExecutionContext {
  return {
    expedition_id: EXPEDITION_UUID,
    expedition_key: "invitation_executor_test",
    expedition_status: "draft",
    stream_position: projectionVersion === 0 ? 1 : 2,
    projection_version: projectionVersion,
    runtime_release: release,
    actor,
    projections: projectionVersion === 0 ? [] : [{
      projection_key: "expedition_setup_view",
      projection_type: "expedition_setup_view",
      subject_id: null,
      schema_id: EXPEDITION_SETUP_VIEW_SCHEMA_ID,
      schema_version: "1",
      projection: baseView(),
      projection_version: projectionVersion,
      source_stream_position: 2,
    }],
  };
}

function persistedResult(
  current: CommandEnvelope,
  actorAuthUserId = AUTH_USER_ID,
): ProcessCommandResult {
  const accepted = current.command_type === "accept_invitation";
  const eventCount = accepted ? 2 : 1;
  return {
    outcome: "accepted",
    replayed: false,
    persisted: true,
    receipt: {
      command_id: current.command_id,
      expedition_id: EXPEDITION_UUID,
      expedition_key: current.expedition_id,
      command_type: current.command_type,
      actor_auth_user_id: actorAuthUserId,
      actor_profile_id: PROFILE_ID,
      actor_membership_id: accepted ? NEW_MEMBERSHIP_ID : CAPTAIN_MEMBERSHIP_ID,
      actor_participant_id: null,
      actor_role: accepted ? "participant" : "captain",
      request_hash: "a".repeat(64),
      status: "accepted",
      received_at: "2026-07-21T19:00:01.000Z",
      processed_at: "2026-07-21T19:00:01.000Z",
      event_ids: Array.from(
        { length: eventCount },
        (_, index) => `evt_executor_${current.command_type}_${index + 1}`,
      ),
      stream_position: 1 + eventCount,
      projection_version: 1,
      runtime_release_id: RELEASE_ID,
      reducer_version: release.reducer_version,
      rejection_code: null,
      rejection_message: null,
      conflict_code: null,
    },
    projection_updates: [{
      projection_key: "expedition_setup_view",
      projection_version: 1,
      source_stream_position: 1 + eventCount,
    }],
    expected_stream_position: 1,
    current_stream_position: 1 + eventCount,
  };
}

class FakeInvitationDatabase implements InvitationDatabase {
  profile: InvitationActiveProfile | null = {
    id: PROFILE_ID,
    auth_user_id: AUTH_USER_ID,
    status: "active",
  };
  candidate: InvitationAcceptanceCandidate | null = {
    invitation_id: INVITATION_UUID,
    email_normalized: "anna@example.test",
    role: "participant",
    status: "pending",
    expires_at: "2026-07-28T19:00:00Z",
    participant_order: 1,
  };
  calls: Array<{ type: string; request: Record<string, JsonValue> }> = [];
  currentCommand = command("invite_participant");

  async loadActiveProfile(): Promise<InvitationActiveProfile | null> {
    return this.profile;
  }

  async loadAcceptanceCandidate(): Promise<InvitationAcceptanceCandidate | null> {
    return this.candidate;
  }

  async inviteParticipant(
    request: Record<string, JsonValue>,
  ): Promise<ProcessCommandResult> {
    this.calls.push({ type: "invite", request });
    return persistedResult(this.currentCommand);
  }

  async acceptInvitation(
    request: Record<string, JsonValue>,
  ): Promise<ProcessCommandResult> {
    this.calls.push({ type: "accept", request });
    return persistedResult(this.currentCommand);
  }

  async revokeInvitation(
    request: Record<string, JsonValue>,
  ): Promise<ProcessCommandResult> {
    this.calls.push({ type: "revoke", request });
    return persistedResult(this.currentCommand);
  }
}

function gatewayDatabase(
  currentContext: GatewayExecutionContext,
): GatewayDatabase {
  return {
    getReceipt: async () => null,
    loadContext: async () => currentContext,
    processCommand: async () => {
      throw new Error("generic processCommand must not handle invitation commands");
    },
  };
}

function uuidSequence(values: string[]): () => string {
  let index = 0;
  return () => {
    const value = values[index++];
    if (!value) throw new Error("uuid sequence exhausted");
    return value;
  };
}

Deno.test("invite executor hashes token, applies server TTL and persists no raw secret", async () => {
  const current = command("invite_participant");
  const database = new FakeInvitationDatabase();
  database.currentCommand = current;
  const executor = createInvitationExecutor({
    database,
    contextDatabase: gatewayDatabase(context({
      auth_user_id: AUTH_USER_ID,
      profile_id: PROFILE_ID,
      membership_id: CAPTAIN_MEMBERSHIP_ID,
      participant_id: null,
      participant_key: null,
      membership_role: "captain",
    })),
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([runtime]),
    now: () => new Date("2026-07-21T19:00:01Z"),
    uuid: uuidSequence([INVITATION_UUID]),
  });

  const outcome = await executor.execute({
    command: current,
    auth_user: {
      id: AUTH_USER_ID,
      email: "captain@example.test",
      email_verified: true,
    },
    request_hash: "a".repeat(64),
  });

  assertEquals(outcome.ok, true);
  assertEquals(database.calls.length, 1);
  const outer = database.calls[0].request;
  const invitation = outer.invitation as Record<string, JsonValue>;
  assertEquals(invitation.email_normalized, "anna@example.test");
  assertEquals(invitation.expires_at, "2026-07-28T19:00:01.000Z");
  assertEquals(typeof invitation.token_hash, "string");
  assertEquals((invitation.token_hash as string).length, 64);
  const serializedProcess = JSON.stringify(outer.process_command_request);
  assertEquals(serializedProcess.includes("anna@example.test"), false);
  assertEquals(serializedProcess.includes("A".repeat(43)), false);
  assertEquals(serializedProcess.includes("token_hash"), false);
});

Deno.test("accept executor creates membership-attributed trusted request", async () => {
  const current = command("accept_invitation");
  const database = new FakeInvitationDatabase();
  database.currentCommand = current;
  const executor = createInvitationExecutor({
    database,
    contextDatabase: gatewayDatabase(context(null, 1)),
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([runtime]),
    now: () => new Date("2026-07-21T19:00:01Z"),
    uuid: uuidSequence([NEW_MEMBERSHIP_ID, NEW_PARTICIPANT_ID]),
  });

  const outcome = await executor.execute({
    command: current,
    auth_user: {
      id: AUTH_USER_ID,
      email: "Anna@Example.Test",
      email_verified: true,
    },
    request_hash: "a".repeat(64),
  });

  assertEquals(outcome.ok, true);
  assertEquals(database.calls.length, 1);
  const outer = database.calls[0].request;
  const membership = outer.participant_membership as Record<string, JsonValue>;
  const participant = outer.participant as Record<string, JsonValue>;
  assertEquals(membership.id, NEW_MEMBERSHIP_ID);
  assertEquals(participant.id, NEW_PARTICIPANT_ID);
  assertEquals(
    participant.participant_key,
    `participant_${NEW_PARTICIPANT_ID.replaceAll("-", "")}`,
  );
  assertEquals(participant.display_name, "Anna");
  const process = outer.process_command_request as Record<string, JsonValue>;
  const actor = process.actor_context as Record<string, JsonValue>;
  assertEquals(actor.membership_id, NEW_MEMBERSHIP_ID);
  assertEquals(actor.participant_id, null);
  assertEquals(
    actor.actor_id,
    `member_${NEW_MEMBERSHIP_ID.replaceAll("-", "")}`,
  );
  const events = process.events as Array<Record<string, JsonValue>>;
  assertEquals(events.map((event) => event.event_type), [
    "invitation.accepted",
    "participant.added",
  ]);
  const serializedProcess = JSON.stringify(process);
  assertEquals(serializedProcess.includes("Anna@Example.Test"), false);
  assertEquals(serializedProcess.includes("A".repeat(43)), false);
});

Deno.test("accept executor rejects a verified-email mismatch before persistence", async () => {
  const current = command("accept_invitation");
  const database = new FakeInvitationDatabase();
  database.currentCommand = current;
  const executor = createInvitationExecutor({
    database,
    contextDatabase: gatewayDatabase(context(null, 1)),
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([runtime]),
    now: () => new Date("2026-07-21T19:00:01Z"),
    uuid: uuidSequence([NEW_MEMBERSHIP_ID, NEW_PARTICIPANT_ID]),
  });

  const outcome = await executor.execute({
    command: current,
    auth_user: {
      id: AUTH_USER_ID,
      email: "other@example.test",
      email_verified: true,
    },
    request_hash: "a".repeat(64),
  });

  assertEquals(outcome.ok, false);
  if (!outcome.ok) {
    assertEquals(outcome.status, 403);
    assertEquals(outcome.code, "invitation_email_mismatch");
  }
  assertEquals(database.calls.length, 0);
});

Deno.test("accept executor requires a verified Auth email", async () => {
  const current = command("accept_invitation");
  const database = new FakeInvitationDatabase();
  const executor = createInvitationExecutor({
    database,
    contextDatabase: gatewayDatabase(context(null, 1)),
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([runtime]),
    now: () => new Date("2026-07-21T19:00:01Z"),
    uuid: uuidSequence([NEW_MEMBERSHIP_ID, NEW_PARTICIPANT_ID]),
  });

  const outcome = await executor.execute({
    command: current,
    auth_user: { id: AUTH_USER_ID, email: "anna@example.test", email_verified: false },
    request_hash: "a".repeat(64),
  });
  assertEquals(outcome.ok, false);
  if (!outcome.ok) assertEquals(outcome.code, "active_profile_required");
  assertEquals(database.calls.length, 0);
});

Deno.test("invitation executor requires the exact pinned invitation runtime", async () => {
  const current = command("invite_participant");
  const database = new FakeInvitationDatabase();
  const executor = createInvitationExecutor({
    database,
    contextDatabase: gatewayDatabase(context({
      auth_user_id: AUTH_USER_ID,
      profile_id: PROFILE_ID,
      membership_id: CAPTAIN_MEMBERSHIP_ID,
      participant_id: null,
      participant_key: null,
      membership_role: "captain",
    })),
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([]),
    now: () => new Date("2026-07-21T19:00:01Z"),
    uuid: uuidSequence([INVITATION_UUID]),
  });

  const outcome = await executor.execute({
    command: current,
    auth_user: { id: AUTH_USER_ID },
    request_hash: "a".repeat(64),
  });
  assertEquals(outcome.ok, false);
  if (!outcome.ok) {
    assertEquals(outcome.status, 503);
    assertEquals(outcome.code, "runtime_release_unavailable");
    assertEquals(outcome.retryable, true);
  }
  assertEquals(database.calls.length, 0);
});

Deno.test("executor exposes generated persisted result", async () => {
  const current = command("invite_participant");
  const database = new FakeInvitationDatabase();
  database.currentCommand = current;
  const executor = createInvitationExecutor({
    database,
    contextDatabase: gatewayDatabase(context({
      auth_user_id: AUTH_USER_ID,
      profile_id: PROFILE_ID,
      membership_id: CAPTAIN_MEMBERSHIP_ID,
      participant_id: null,
      participant_key: null,
      membership_role: "captain",
    })),
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([runtime]),
    now: () => new Date("2026-07-21T19:00:01Z"),
    uuid: uuidSequence([INVITATION_UUID]),
  });
  const outcome = await executor.execute({
    command: current,
    auth_user: { id: AUTH_USER_ID },
    request_hash: "a".repeat(64),
  });
  assertEquals(outcome.ok, true);
  if (outcome.ok) assertExists(outcome.result.receipt);
});
