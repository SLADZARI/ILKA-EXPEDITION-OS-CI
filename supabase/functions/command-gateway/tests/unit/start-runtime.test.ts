import { assertEquals } from "jsr:@std/assert@1.0.19";

import {
  createExpeditionStartRuntime,
  START_SETUP_VIEW_SCHEMA_ID,
} from "../../../_shared/engine-runtime/expedition-start-v1.ts";
import type {
  ActorContext,
  CommandEnvelope,
  GatewayExecutionContext,
  JsonValue,
  ProjectionDocument,
  RuntimeInput,
} from "../../../_shared/command-gateway/types.ts";

const RELEASE = {
  id: "60000000-0000-0000-0000-00000000009d",
  release_key: "start_runtime_test",
  git_commit_sha: "000000000000000000000000000000000000009d",
  rules_release: "engine_v10_start_test",
  content_release: "start_test_v1",
  reducer_version: "start_runtime_test_v1",
};

const runtime = createExpeditionStartRuntime({
  ...RELEASE,
  team_size_min: 3,
  team_size_max: 5,
  first_stage_id: "onboarding",
  rotation_rules_version: 2,
  product_captain_role: "product_captain",
  product_support_role: "product_support",
  cook_role: "cook",
});

const MEMBERSHIP_ID = "30000000-0000-0000-0000-00000000009d";
const ACTOR_ID = `member_${MEMBERSHIP_ID.replaceAll("-", "")}`;

function actor(): ActorContext {
  return {
    auth_user_id: "10000000-0000-0000-0000-00000000009d",
    profile_id: "20000000-0000-0000-0000-00000000009d",
    membership_id: MEMBERSHIP_ID,
    participant_id: null,
    participant_key: null,
    membership_role: "captain",
  };
}

function command(overrides: Partial<CommandEnvelope> = {}): CommandEnvelope {
  return {
    command_id: "cmd_start_runtime_test",
    command_type: "start_expedition",
    issued_at: "2026-07-22T07:00:00+03:00",
    actor_id: ACTOR_ID,
    actor_role: "captain",
    expedition_id: "start_runtime_test",
    idempotency_key: "cmd_start_runtime_test",
    day_number: null,
    stage_id: null,
    day_revision: null,
    payload: {},
    ...overrides,
  };
}

function participant(index: number): Record<string, JsonValue> {
  return {
    participant_id: `participant_${index.toString(16).padStart(32, "0")}`,
    display_name: `Participant ${index}`,
    participant_order: index,
    status: "active",
  };
}

function setupView(count = 4, projectionVersion = 5): Record<string, JsonValue> {
  const participants = Array.from({ length: count }, (_, index) => participant(index + 1));
  const onboard = ["navigation", "mooring", "order", "cook", "product_focus"];
  return {
    expedition_id: "start_runtime_test",
    expedition_status: "ready",
    team: {
      active_participant_count: count,
      pending_invitation_count: 0,
      minimum: 3,
      maximum: 5,
      slots_remaining: 5 - count,
    },
    participants,
    invitations: [],
    rotation: {
      status: "generated",
      rotation_id: "rotation_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      rules_version: 2,
      assignments: participants.map((item, index) => ({
        participant_id: item.participant_id,
        product_role_id: index === 0 ? "product_captain" : "product_support",
        onboard_role_id: onboard[index],
      })),
    },
    readiness: {
      can_generate_rotation: false,
      can_start_expedition: true,
      blockers: [],
    },
    controls: {
      invite_participant: false,
      revoke_invitation: false,
      generate_rotation: false,
      start_expedition: true,
    },
    expected_projection_version: projectionVersion,
    sync_status: "synced",
  };
}

function document(projection: Record<string, JsonValue>, version = 5): ProjectionDocument {
  return {
    projection_key: "expedition_setup_view",
    projection_type: "expedition_setup_view",
    subject_id: null,
    schema_id: START_SETUP_VIEW_SCHEMA_ID,
    schema_version: "1",
    projection,
    projection_version: version,
    source_stream_position: 9,
  };
}

function input(
  view = setupView(),
  currentCommand = command(),
  contextOverrides: Partial<GatewayExecutionContext> = {},
): RuntimeInput {
  const context: GatewayExecutionContext = {
    expedition_id: "50000000-0000-0000-0000-00000000009d",
    expedition_key: "start_runtime_test",
    expedition_status: "ready",
    stream_position: 9,
    projection_version: 5,
    runtime_release: RELEASE,
    actor: actor(),
    projections: [document(view)],
    ...contextOverrides,
  };
  return {
    command: currentCommand,
    actor_id: currentCommand.actor_id,
    actor_role: currentCommand.actor_role,
    context,
    received_at: "2026-07-22T07:00:01+03:00",
  };
}

Deno.test("start_expedition opens onboarding and activates only the Expedition", async () => {
  const prepared = await runtime.reduce(input());
  assertEquals(prepared.status, "accepted");
  assertEquals(prepared.events.map((event) => event.event_type), [
    "expedition.started",
    "stage.opened",
  ]);
  assertEquals(prepared.events[0].payload, {});
  assertEquals(prepared.events[1].payload, { stage_id: "onboarding" });
  assertEquals(prepared.events.every((event) => event.day_number === null), true);
  assertEquals(prepared.projection_mutations.length, 1);
  const projection = prepared.projection_mutations[0].projection;
  assertEquals(projection.expedition_status, "active");
  assertEquals(projection.expected_projection_version, 6);
  assertEquals((projection.controls as Record<string, JsonValue>).start_expedition, false);
  assertEquals((projection.readiness as Record<string, JsonValue>).can_start_expedition, false);
});

Deno.test("start_expedition preserves generated Rotation Plan", async () => {
  const original = setupView();
  const prepared = await runtime.reduce(input(original));
  assertEquals(prepared.projection_mutations[0].projection.rotation, original.rotation);
});

Deno.test("start_expedition rejects non-ready aggregate", async () => {
  const prepared = await runtime.reduce(input(setupView(), command(), {
    expedition_status: "draft",
  }));
  assertEquals(prepared.status, "rejected");
  assertEquals(prepared.rejection?.code, "expedition_not_ready");
});

Deno.test("start_expedition rejects an already active aggregate", async () => {
  const view = setupView();
  view.expedition_status = "active";
  const prepared = await runtime.reduce(input(view, command(), {
    expedition_status: "active",
  }));
  assertEquals(prepared.status, "rejected");
  assertEquals(prepared.rejection?.code, "expedition_already_started");
});

Deno.test("start_expedition rejects a spoofed Captain", async () => {
  const prepared = await runtime.reduce(input(
    setupView(),
    command({ actor_id: "member_spoofed" }),
  ));
  assertEquals(prepared.status, "rejected");
  assertEquals(prepared.rejection?.code, "actor_spoofing_detected");
});

Deno.test("start_expedition rejects non-empty payload", async () => {
  const prepared = await runtime.reduce(input(
    setupView(),
    command({ payload: { stage_id: "onboarding" } }),
  ));
  assertEquals(prepared.status, "rejected");
  assertEquals(prepared.rejection?.code, "validation_failed");
});

Deno.test("start_expedition rejects an incompatible rotation", async () => {
  const view = setupView();
  const rotation = view.rotation as Record<string, JsonValue>;
  const assignments = rotation.assignments as Array<Record<string, JsonValue>>;
  assignments[3].product_role_id = "product_captain";
  const prepared = await runtime.reduce(input(view));
  assertEquals(prepared.status, "rejected");
  assertEquals(prepared.rejection?.code, "rotation_not_ready");
});

Deno.test("start_expedition rejects existing Day projections", async () => {
  const context = input().context;
  const today: ProjectionDocument = {
    ...document(setupView()),
    projection_key: "today_view:participant_01",
    projection_type: "today_view",
    subject_id: "participant_01",
    schema_id: "https://ilka.local/schemas/today-view.schema.json",
  };
  const prepared = await runtime.reduce(input(setupView(), command(), {
    projections: [...context.projections, today],
  }));
  assertEquals(prepared.status, "rejected");
  assertEquals(prepared.rejection?.code, "calendar_day_already_exists");
});
