import { assertEquals, assertExists } from "jsr:@std/assert@1.0.19";

import {
  createExpeditionInvitationRuntime,
  EXPEDITION_SETUP_VIEW_SCHEMA_ID,
  type InvitationExecutionContext,
  type InvitationOperation,
} from "../../../_shared/engine-runtime/expedition-invitations-v1.ts";
import type {
  ActorContext,
  CommandEnvelope,
  GatewayExecutionContext,
  JsonValue,
  ProjectionDocument,
  RuntimeInput,
} from "../../../_shared/command-gateway/types.ts";

const RELEASE = {
  id: "60000000-0000-0000-0000-000000000092",
  release_key: "invitation_runtime_test",
  git_commit_sha: "0000000000000000000000000000000000000092",
  rules_release: "engine_v11_invitation_test",
  content_release: "invitation_test_v1",
  reducer_version: "invitation_runtime_test_v1",
};

const runtime = createExpeditionInvitationRuntime({
  ...RELEASE,
  team_size_min: 3,
  team_size_max: 5,
  invitation_ttl_hours: 168,
});

function actor(
  role: "captain" | "participant",
  membershipId: string,
): ActorContext {
  return {
    auth_user_id: role === "captain"
      ? "10000000-0000-0000-0000-000000000092"
      : "10000000-0000-0000-0000-000000000093",
    profile_id: role === "captain"
      ? "20000000-0000-0000-0000-000000000092"
      : "20000000-0000-0000-0000-000000000093",
    membership_id: membershipId,
    participant_id: null,
    participant_key: null,
    membership_role: role,
  };
}

function command(
  commandType: "invite_participant" | "accept_invitation" | "revoke_invitation",
  actorId: string,
  actorRole: "captain" | "participant",
  payload: Record<string, JsonValue>,
): CommandEnvelope {
  return {
    command_id: `cmd_runtime_${commandType}`,
    command_type: commandType,
    issued_at: "2026-07-21T18:30:00Z",
    actor_id: actorId,
    actor_role: actorRole,
    expedition_id: "invitation_runtime_test",
    idempotency_key: `cmd_runtime_${commandType}`,
    day_number: null,
    stage_id: null,
    day_revision: null,
    payload,
  };
}

function setupDocument(
  projection: Record<string, JsonValue>,
  projectionVersion: number,
): ProjectionDocument {
  return {
    projection_key: "expedition_setup_view",
    projection_type: "expedition_setup_view",
    subject_id: null,
    schema_id: EXPEDITION_SETUP_VIEW_SCHEMA_ID,
    schema_version: "1",
    projection,
    projection_version: projectionVersion,
    source_stream_position: projectionVersion,
  };
}

function setupView(
  projectionVersion: number,
): Record<string, JsonValue> {
  return {
    expedition_id: "invitation_runtime_test",
    expedition_status: "draft",
    team: {
      active_participant_count: 2,
      pending_invitation_count: 1,
      minimum: 3,
      maximum: 5,
      slots_remaining: 2,
    },
    participants: [
      {
        participant_id: "participant_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        display_name: "A",
        participant_order: 1,
        status: "active",
      },
      {
        participant_id: "participant_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        display_name: "B",
        participant_order: 2,
        status: "active",
      },
    ],
    invitations: [{
      invitation_id: "invitation_cccccccccccccccccccccccccccccccc",
      email_hint: "c***@example.test",
      role: "participant",
      status: "pending",
      expires_at: "2026-07-28T18:30:00Z",
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
    expected_projection_version: projectionVersion,
    sync_status: "synced",
  };
}

function input(
  currentCommand: CommandEnvelope,
  currentActor: ActorContext,
  operation: InvitationOperation,
  projectionVersion = 0,
  projections: ProjectionDocument[] = [],
): RuntimeInput {
  const context: InvitationExecutionContext = {
    expedition_id: "50000000-0000-0000-0000-000000000092",
    expedition_key: "invitation_runtime_test",
    expedition_status: "draft",
    stream_position: 1,
    projection_version: projectionVersion,
    runtime_release: RELEASE,
    actor: currentActor,
    projections,
    invitation_operation: operation,
  };
  return {
    command: currentCommand,
    actor_id: currentCommand.actor_id,
    actor_role: currentCommand.actor_role,
    context: context as GatewayExecutionContext,
    received_at: "2026-07-21T18:30:01Z",
  };
}

Deno.test("invite_participant initializes a complete secret-free setup projection", async () => {
  const membershipId = "30000000-0000-0000-0000-000000000092";
  const actorId = `member_${membershipId.replaceAll("-", "")}`;
  const current = command(
    "invite_participant",
    actorId,
    "captain",
    {
      email: "secret@example.test",
      invitation_token: "A".repeat(43),
    },
  );
  const prepared = await runtime.reduce(input(
    current,
    actor("captain", membershipId),
    {
      kind: "invite",
      invitation_id: "invitation_cccccccccccccccccccccccccccccccc",
      email_hint: "s***@example.test",
      expires_at: "2026-07-28T18:30:01Z",
    },
  ));

  assertEquals(prepared.status, "accepted");
  assertEquals(prepared.events.map((event) => event.event_type), [
    "invitation.created",
  ]);
  assertEquals(prepared.projection_mutations.length, 1);
  const projection = prepared.projection_mutations[0].projection;
  assertEquals(projection.expedition_status, "draft");
  assertEquals(
    (projection.team as Record<string, JsonValue>).pending_invitation_count,
    1,
  );
  assertEquals(projection.expected_projection_version, 1);
  const serialized = JSON.stringify(prepared);
  assertEquals(serialized.includes("secret@example.test"), false);
  assertEquals(serialized.includes("A".repeat(43)), false);
});

Deno.test("accept_invitation creates the third Participant and enables rotation", async () => {
  const membershipId = "30000000-0000-0000-0000-000000000093";
  const actorId = `member_${membershipId.replaceAll("-", "")}`;
  const current = command(
    "accept_invitation",
    actorId,
    "participant",
    {
      invitation_token: "B".repeat(43),
      display_name: "C",
    },
  );
  const prepared = await runtime.reduce(input(
    current,
    actor("participant", membershipId),
    {
      kind: "accept",
      invitation_id: "invitation_cccccccccccccccccccccccccccccccc",
      participant_id: "participant_cccccccccccccccccccccccccccccccc",
      display_name: "C",
      participant_order: 3,
    },
    4,
    [setupDocument(setupView(4), 4)],
  ));

  assertEquals(prepared.status, "accepted");
  assertEquals(prepared.events.map((event) => event.event_type), [
    "invitation.accepted",
    "participant.added",
  ]);
  const projection = prepared.projection_mutations[0].projection;
  const readiness = projection.readiness as Record<string, JsonValue>;
  assertEquals(readiness.can_generate_rotation, true);
  assertEquals(projection.expected_projection_version, 5);
  const participants = projection.participants as Array<Record<string, JsonValue>>;
  assertEquals(participants.map((participant) => participant.participant_order), [
    1,
    2,
    3,
  ]);
});

Deno.test("revoke_invitation marks one pending invitation terminal", async () => {
  const membershipId = "30000000-0000-0000-0000-000000000092";
  const actorId = `member_${membershipId.replaceAll("-", "")}`;
  const current = command(
    "revoke_invitation",
    actorId,
    "captain",
    {
      invitation_id: "invitation_cccccccccccccccccccccccccccccccc",
      reason: "Unavailable",
    },
  );
  const prepared = await runtime.reduce(input(
    current,
    actor("captain", membershipId),
    {
      kind: "revoke",
      invitation_id: "invitation_cccccccccccccccccccccccccccccccc",
      reason: "Unavailable",
    },
    2,
    [setupDocument(setupView(2), 2)],
  ));

  assertEquals(prepared.status, "accepted");
  assertEquals(prepared.events[0].event_type, "invitation.revoked");
  const invitations = prepared.projection_mutations[0].projection.invitations as
    Array<Record<string, JsonValue>>;
  assertEquals(invitations[0].status, "revoked");
  const team = prepared.projection_mutations[0].projection.team as
    Record<string, JsonValue>;
  assertEquals(team.pending_invitation_count, 0);
});

Deno.test("accept_invitation requires an existing ExpeditionSetupView", async () => {
  const membershipId = "30000000-0000-0000-0000-000000000093";
  const actorId = `member_${membershipId.replaceAll("-", "")}`;
  const prepared = await runtime.reduce(input(
    command(
      "accept_invitation",
      actorId,
      "participant",
      { invitation_token: "C".repeat(43), display_name: "C" },
    ),
    actor("participant", membershipId),
    {
      kind: "accept",
      invitation_id: "invitation_cccccccccccccccccccccccccccccccc",
      participant_id: "participant_cccccccccccccccccccccccccccccccc",
      display_name: "C",
      participant_order: 3,
    },
  ));
  assertEquals(prepared.status, "rejected");
  assertEquals(
    prepared.rejection?.code,
    "expedition_setup_projection_missing",
  );
});

Deno.test("invitation reducer rejects a spoofed membership actor", async () => {
  const membershipId = "30000000-0000-0000-0000-000000000092";
  const prepared = await runtime.reduce(input(
    command(
      "invite_participant",
      "member_spoofed",
      "captain",
      { email: "a@example.test", invitation_token: "D".repeat(43) },
    ),
    actor("captain", membershipId),
    {
      kind: "invite",
      invitation_id: "invitation_dddddddddddddddddddddddddddddddd",
      email_hint: "a***@example.test",
      expires_at: "2026-07-28T18:30:01Z",
    },
  ));
  assertEquals(prepared.status, "rejected");
  assertEquals(prepared.rejection?.code, "profile_actor_mismatch");
});

Deno.test("invitation runtime exposes immutable policy metadata", () => {
  assertExists(runtime.invitation_policy);
  assertEquals(runtime.invitation_policy, {
    team_size_min: 3,
    team_size_max: 5,
    invitation_ttl_hours: 168,
  });
});
