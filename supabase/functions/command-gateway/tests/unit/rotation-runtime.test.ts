import { assertEquals, assertExists } from "jsr:@std/assert@1.0.19";

import {
  createExpeditionRotationRuntime,
  ROTATION_SETUP_VIEW_SCHEMA_ID,
} from "../../../_shared/engine-runtime/expedition-rotation-v1.ts";
import type {
  ActorContext,
  CommandEnvelope,
  GatewayExecutionContext,
  JsonValue,
  PreparedCommandResult,
  ProjectionDocument,
  RuntimeInput,
} from "../../../_shared/command-gateway/types.ts";

const RELEASE = {
  id: "60000000-0000-0000-0000-00000000009c",
  release_key: "rotation_runtime_test",
  git_commit_sha: "000000000000000000000000000000000000009c",
  rules_release: "engine_v2_rotation_test",
  content_release: "rotation_test_v1",
  reducer_version: "rotation_runtime_test_v1",
};

const runtime = createExpeditionRotationRuntime({
  ...RELEASE,
  team_size_min: 3,
  team_size_max: 5,
  rotation_rules_version: 2,
  onboard_role_cycle: [
    "navigation",
    "mooring",
    "order",
    "cook",
    "product_focus",
  ],
  onboarding_product_captain_role: "product_captain",
  onboarding_support_role: "product_support",
});

const CAPTAIN_MEMBERSHIP_ID = "30000000-0000-0000-0000-00000000009c";
const CAPTAIN_ACTOR_ID = `member_${CAPTAIN_MEMBERSHIP_ID.replaceAll("-", "")}`;

function actor(): ActorContext {
  return {
    auth_user_id: "10000000-0000-0000-0000-00000000009c",
    profile_id: "20000000-0000-0000-0000-00000000009c",
    membership_id: CAPTAIN_MEMBERSHIP_ID,
    participant_id: null,
    participant_key: null,
    membership_role: "captain",
  };
}

function command(overrides: Partial<CommandEnvelope> = {}): CommandEnvelope {
  return {
    command_id: "cmd_rotation_runtime_test",
    command_type: "generate_rotation",
    issued_at: "2026-07-21T21:30:00Z",
    actor_id: CAPTAIN_ACTOR_ID,
    actor_role: "captain",
    expedition_id: "rotation_runtime_test",
    idempotency_key: "cmd_rotation_runtime_test",
    day_number: null,
    stage_id: null,
    day_revision: null,
    payload: {},
    ...overrides,
  };
}

function participant(index: number): Record<string, JsonValue> {
  const hex = index.toString(16).padStart(32, "0");
  return {
    participant_id: `participant_${hex}`,
    display_name: `Participant ${index}`,
    participant_order: index,
    status: "active",
  };
}

function setupView(
  count: number,
  projectionVersion = 4,
  options: {
    pending?: boolean;
    rotationStatus?: "not_generated" | "generated";
    duplicateOrder?: boolean;
  } = {},
): Record<string, JsonValue> {
  const participants = Array.from(
    { length: count },
    (_, index) => participant(index + 1),
  );
  if (options.duplicateOrder && participants[1]) {
    participants[1].participant_order = 1;
  }
  const pending = options.pending === true;
  const rotationStatus = options.rotationStatus ?? "not_generated";
  return {
    expedition_id: "rotation_runtime_test",
    expedition_status: "draft",
    team: {
      active_participant_count: count,
      pending_invitation_count: pending ? 1 : 0,
      minimum: 3,
      maximum: 5,
      slots_remaining: Math.max(0, 5 - count - (pending ? 1 : 0)),
    },
    participants,
    invitations: pending
      ? [{
        invitation_id: "invitation_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        email_hint: "a***@example.test",
        role: "participant",
        status: "pending",
        expires_at: "2026-07-28T21:30:00Z",
        accepted_participant_id: null,
      }]
      : [],
    rotation: rotationStatus === "generated"
      ? {
        status: "generated",
        rotation_id: "rotation_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        rules_version: 2,
        assignments: [],
      }
      : {
        status: "not_generated",
        rotation_id: null,
        rules_version: null,
        assignments: [],
      },
    readiness: {
      can_generate_rotation: !pending && count >= 3 &&
        rotationStatus === "not_generated",
      can_start_expedition: false,
      blockers: [],
    },
    controls: {
      invite_participant: count + (pending ? 1 : 0) < 5,
      revoke_invitation: pending,
      generate_rotation: !pending && count >= 3 && rotationStatus === "not_generated",
      start_expedition: false,
    },
    expected_projection_version: projectionVersion,
    sync_status: "synced",
  };
}

function document(
  projection: Record<string, JsonValue>,
  projectionVersion = 4,
): ProjectionDocument {
  return {
    projection_key: "expedition_setup_view",
    projection_type: "expedition_setup_view",
    subject_id: null,
    schema_id: ROTATION_SETUP_VIEW_SCHEMA_ID,
    schema_version: "1",
    projection,
    projection_version: projectionVersion,
    source_stream_position: 7,
  };
}

function input(
  projection: Record<string, JsonValue>,
  currentCommand = command(),
  projectionVersion = 4,
  actorOverride: ActorContext | null = actor(),
): RuntimeInput {
  const context: GatewayExecutionContext = {
    expedition_id: "50000000-0000-0000-0000-00000000009c",
    expedition_key: "rotation_runtime_test",
    expedition_status: "draft",
    stream_position: 7,
    projection_version: projectionVersion,
    runtime_release: RELEASE,
    actor: actorOverride,
    projections: [document(projection, projectionVersion)],
  };
  return {
    command: currentCommand,
    actor_id: currentCommand.actor_id,
    actor_role: currentCommand.actor_role,
    context,
    received_at: "2026-07-21T21:30:01Z",
  };
}

function eventPayload(
  prepared: PreparedCommandResult,
  eventIndex = 0,
): Record<string, JsonValue> {
  const currentEvent = prepared.events[eventIndex];
  assertExists(currentEvent);
  const payload = currentEvent.payload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`rotation_test_event_payload_invalid:${eventIndex}`);
  }
  return payload;
}

function rotationAssignments(
  prepared: PreparedCommandResult,
): Array<Record<string, JsonValue>> {
  const assignments = eventPayload(prepared).assignments;
  if (!Array.isArray(assignments)) {
    throw new Error("rotation_test_assignments_missing");
  }
  return assignments as Array<Record<string, JsonValue>>;
}

Deno.test("three Participants receive deterministic initial roles", async () => {
  const prepared = await runtime.reduce(input(setupView(3)));
  assertEquals(prepared.status, "accepted");
  assertEquals(prepared.events.map((event) => event.event_type), [
    "rotation.generated",
    "expedition.ready",
  ]);
  assertEquals(rotationAssignments(prepared), [
    {
      participant_id: "participant_00000000000000000000000000000001",
      product_role_id: "product_captain",
      onboard_role_id: "navigation",
    },
    {
      participant_id: "participant_00000000000000000000000000000002",
      product_role_id: "product_support",
      onboard_role_id: "mooring",
    },
    {
      participant_id: "participant_00000000000000000000000000000003",
      product_role_id: "product_support",
      onboard_role_id: "order",
    },
  ]);
});

Deno.test("four Participants assign Cook only product_support", async () => {
  const prepared = await runtime.reduce(input(setupView(4)));
  assertEquals(prepared.status, "accepted");
  const assignments = rotationAssignments(prepared);
  const cook = assignments.find((assignment) => assignment.onboard_role_id === "cook");
  assertExists(cook);
  assertEquals(cook.product_role_id, "product_support");
  assertEquals(
    assignments.filter((assignment) => assignment.product_role_id === "product_captain")
      .length,
    1,
  );
});

Deno.test("five Participants cover the complete onboard cycle", async () => {
  const prepared = await runtime.reduce(input(setupView(5)));
  assertEquals(prepared.status, "accepted");
  const assignments = rotationAssignments(prepared);
  assertEquals(assignments.map((assignment) => assignment.onboard_role_id), [
    "navigation",
    "mooring",
    "order",
    "cook",
    "product_focus",
  ]);
  const projection = prepared.projection_mutations[0].projection;
  assertEquals(projection.expedition_status, "ready");
  assertEquals(projection.expected_projection_version, 5);
  assertEquals(
    (projection.readiness as Record<string, JsonValue>).can_start_expedition,
    true,
  );
  assertEquals(
    (projection.controls as Record<string, JsonValue>).start_expedition,
    true,
  );
});

Deno.test("same authoritative input produces the same seed and rotation id", async () => {
  const first = await runtime.reduce(input(setupView(5)));
  const second = await runtime.reduce(input(setupView(5)));
  const firstPayload = eventPayload(first);
  const secondPayload = eventPayload(second);
  assertEquals(firstPayload.seed, secondPayload.seed);
  assertEquals(firstPayload.rotation_id, secondPayload.rotation_id);
});

Deno.test("fewer than three Participants is rejected", async () => {
  const prepared = await runtime.reduce(input(setupView(2)));
  assertEquals(prepared.status, "rejected");
  assertEquals(prepared.rejection?.code, "rotation_not_ready");
});

Deno.test("pending invitations block rotation", async () => {
  const prepared = await runtime.reduce(input(setupView(3, 4, { pending: true })));
  assertEquals(prepared.status, "rejected");
  assertEquals(prepared.rejection?.code, "pending_invitations_exist");
});

Deno.test("duplicate Participant order is rejected", async () => {
  const prepared = await runtime.reduce(input(setupView(3, 4, {
    duplicateOrder: true,
  })));
  assertEquals(prepared.status, "rejected");
  assertEquals(prepared.rejection?.code, "participant_order_unavailable");
});

Deno.test("an existing rotation cannot be regenerated", async () => {
  const prepared = await runtime.reduce(input(setupView(3, 4, {
    rotationStatus: "generated",
  })));
  assertEquals(prepared.status, "rejected");
  assertEquals(prepared.rejection?.code, "rotation_already_generated");
});

Deno.test("rotation rejects spoofed Captain actor", async () => {
  const prepared = await runtime.reduce(input(
    setupView(3),
    command({ actor_id: "member_spoofed" }),
  ));
  assertEquals(prepared.status, "rejected");
  assertEquals(prepared.rejection?.code, "actor_spoofing_detected");
});

Deno.test("rotation requires empty command payload", async () => {
  const prepared = await runtime.reduce(input(
    setupView(3),
    command({ payload: { seed: "browser-controlled" } }),
  ));
  assertEquals(prepared.status, "rejected");
  assertEquals(prepared.rejection?.code, "validation_failed");
});

Deno.test("runtime exposes immutable rotation policy", () => {
  assertEquals(runtime.rotation_policy.rotation_rules_version, 2);
  assertEquals(runtime.rotation_policy.onboard_role_cycle, [
    "navigation",
    "mooring",
    "order",
    "cook",
    "product_focus",
  ]);
});
