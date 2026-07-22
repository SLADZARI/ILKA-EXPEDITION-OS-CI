import { assertEquals } from "jsr:@std/assert@1.0.19";

import { createExpeditionStartRuntime } from "../../../_shared/engine-runtime/expedition-start-v1.ts";
import type { StartDatabase } from "../../../_shared/command-gateway/start-database.ts";
import { createStartExecutor } from "../../../_shared/command-gateway/start.ts";
import { StaticRuntimeRegistry } from "../../../_shared/command-gateway/runtime-registry.ts";
import { createSchemaValidator } from "../../../_shared/command-gateway/schema-validation.ts";
import type {
  CommandEnvelope,
  GatewayDatabase,
  GatewayExecutionContext,
  JsonValue,
  ProcessCommandResult,
} from "../../../_shared/command-gateway/types.ts";

const AUTH_USER_ID = "10000000-0000-0000-0000-00000000009e";
const PROFILE_ID = "20000000-0000-0000-0000-00000000009e";
const MEMBERSHIP_ID = "30000000-0000-0000-0000-00000000009e";
const EXPEDITION_ID = "50000000-0000-0000-0000-00000000009e";
const RELEASE_ID = "60000000-0000-0000-0000-00000000009e";
const ACTOR_ID = `member_${MEMBERSHIP_ID.replaceAll("-", "")}`;

const release = {
  id: RELEASE_ID,
  release_key: "start_executor_test",
  git_commit_sha: "000000000000000000000000000000000000009e",
  rules_release: "engine_v10_start_executor_test",
  content_release: "start_executor_test_v1",
  reducer_version: "start_executor_test_v1",
};

const runtime = createExpeditionStartRuntime({
  ...release,
  team_size_min: 3,
  team_size_max: 5,
  first_stage_id: "onboarding",
  rotation_rules_version: 2,
  product_captain_role: "product_captain",
  product_support_role: "product_support",
  cook_role: "cook",
});

function command(overrides: Partial<CommandEnvelope> = {}): CommandEnvelope {
  return {
    command_id: "cmd_start_executor_test",
    command_type: "start_expedition",
    issued_at: "2026-07-22T07:10:00+03:00",
    actor_id: ACTOR_ID,
    actor_role: "captain",
    expedition_id: "start_executor_test",
    idempotency_key: "cmd_start_executor_test",
    day_number: null,
    stage_id: null,
    day_revision: null,
    payload: {},
    ...overrides,
  };
}

function setupProjection(): Record<string, JsonValue> {
  const participants = [1, 2, 3, 4].map((index) => ({
    participant_id: `participant_${index.toString(16).padStart(32, "0")}`,
    display_name: `Participant ${index}`,
    participant_order: index,
    status: "active",
  }));
  const onboard = ["navigation", "mooring", "order", "cook"];
  return {
    expedition_id: "start_executor_test",
    expedition_status: "ready",
    team: {
      active_participant_count: 4,
      pending_invitation_count: 0,
      minimum: 3,
      maximum: 5,
      slots_remaining: 1,
    },
    participants,
    invitations: [],
    rotation: {
      status: "generated",
      rotation_id: "rotation_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      rules_version: 2,
      assignments: participants.map((participant, index) => ({
        participant_id: participant.participant_id,
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
    expected_projection_version: 5,
    sync_status: "synced",
  };
}

function context(role: "captain" | "participant" = "captain"): GatewayExecutionContext {
  return {
    expedition_id: EXPEDITION_ID,
    expedition_key: "start_executor_test",
    expedition_status: "ready",
    stream_position: 9,
    projection_version: 5,
    runtime_release: release,
    actor: {
      auth_user_id: AUTH_USER_ID,
      profile_id: PROFILE_ID,
      membership_id: MEMBERSHIP_ID,
      participant_id: role === "captain"
        ? null
        : "70000000-0000-0000-0000-00000000009e",
      participant_key: role === "captain"
        ? null
        : "participant_00000000000000000000000000000001",
      membership_role: role,
    },
    projections: [{
      projection_key: "expedition_setup_view",
      projection_type: "expedition_setup_view",
      subject_id: null,
      schema_id: "https://ilka.local/schemas/expedition-setup-view.schema.json",
      schema_version: "1",
      projection: setupProjection(),
      projection_version: 5,
      source_stream_position: 9,
    }],
  };
}

function result(current: CommandEnvelope): ProcessCommandResult {
  return {
    outcome: "accepted",
    replayed: false,
    persisted: true,
    receipt: {
      command_id: current.command_id,
      expedition_id: EXPEDITION_ID,
      expedition_key: current.expedition_id,
      command_type: current.command_type,
      actor_auth_user_id: AUTH_USER_ID,
      actor_profile_id: PROFILE_ID,
      actor_membership_id: MEMBERSHIP_ID,
      actor_participant_id: null,
      actor_role: "captain",
      request_hash: "a".repeat(64),
      status: "accepted",
      received_at: "2026-07-22T07:10:01+03:00",
      processed_at: "2026-07-22T07:10:01+03:00",
      event_ids: ["evt_start_executor_test_01", "evt_start_executor_test_02"],
      stream_position: 11,
      projection_version: 6,
      runtime_release_id: RELEASE_ID,
      reducer_version: release.reducer_version,
      rejection_code: null,
      rejection_message: null,
      conflict_code: null,
    },
    projection_updates: [{
      projection_key: "expedition_setup_view",
      projection_version: 6,
      source_stream_position: 11,
    }],
    expected_stream_position: 9,
    current_stream_position: 11,
  };
}

class FakeStartDatabase implements StartDatabase {
  calls: Array<Record<string, JsonValue>> = [];
  current = command();
  error: Error | null = null;
  async startExpedition(
    request: Record<string, JsonValue>,
  ): Promise<ProcessCommandResult> {
    this.calls.push(request);
    if (this.error) throw this.error;
    return result(this.current);
  }
}

function gatewayDatabase(value: GatewayExecutionContext | null): GatewayDatabase {
  return {
    getReceipt: async () => null,
    loadContext: async () => value,
    processCommand: async () => {
      throw new Error("generic processCommand must not handle start_expedition");
    },
  };
}

Deno.test("start executor prepares one trusted atomic wrapper request", async () => {
  const database = new FakeStartDatabase();
  const executor = createStartExecutor({
    database,
    contextDatabase: gatewayDatabase(context()),
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([runtime]),
    now: () => new Date("2026-07-22T04:10:01Z"),
  });
  const outcome = await executor.execute({
    command: command(),
    auth_user: { id: AUTH_USER_ID },
    request_hash: "a".repeat(64),
  });
  assertEquals(outcome.ok, true);
  assertEquals(database.calls.length, 1);
  const outer = database.calls[0];
  const transition = outer.expedition_transition as Record<string, JsonValue>;
  assertEquals(transition.expected_status, "ready");
  assertEquals(transition.next_status, "active");
  assertEquals(transition.stage_id, "onboarding");
  assertEquals(transition.rotation_id, "rotation_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  const process = outer.process_command_request as Record<string, JsonValue>;
  const events = process.events as Array<Record<string, JsonValue>>;
  assertEquals(events.map((event) => event.event_type), [
    "expedition.started",
    "stage.opened",
  ]);
});

Deno.test("start executor rejects non-Captain before persistence", async () => {
  const database = new FakeStartDatabase();
  const executor = createStartExecutor({
    database,
    contextDatabase: gatewayDatabase(context("participant")),
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([runtime]),
    now: () => new Date("2026-07-22T04:10:01Z"),
  });
  const outcome = await executor.execute({
    command: command(),
    auth_user: { id: AUTH_USER_ID },
    request_hash: "a".repeat(64),
  });
  assertEquals(outcome.ok, false);
  if (!outcome.ok) assertEquals(outcome.code, "active_captain_membership_required");
  assertEquals(database.calls.length, 0);
});

Deno.test("start executor rejects spoofed actor before persistence", async () => {
  const database = new FakeStartDatabase();
  const executor = createStartExecutor({
    database,
    contextDatabase: gatewayDatabase(context()),
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([runtime]),
    now: () => new Date("2026-07-22T04:10:01Z"),
  });
  const outcome = await executor.execute({
    command: command({ actor_id: "member_spoofed" }),
    auth_user: { id: AUTH_USER_ID },
    request_hash: "a".repeat(64),
  });
  assertEquals(outcome.ok, false);
  if (!outcome.ok) assertEquals(outcome.code, "actor_spoofing_detected");
  assertEquals(database.calls.length, 0);
});

Deno.test("start executor requires exact pinned start runtime", async () => {
  const database = new FakeStartDatabase();
  const executor = createStartExecutor({
    database,
    contextDatabase: gatewayDatabase(context()),
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([]),
    now: () => new Date("2026-07-22T04:10:01Z"),
  });
  const outcome = await executor.execute({
    command: command(),
    auth_user: { id: AUTH_USER_ID },
    request_hash: "a".repeat(64),
  });
  assertEquals(outcome.ok, false);
  if (!outcome.ok) {
    assertEquals(outcome.code, "runtime_release_unavailable");
    assertEquals(outcome.retryable, true);
  }
  assertEquals(database.calls.length, 0);
});

Deno.test("start executor maps stable wrapper failures", async () => {
  const database = new FakeStartDatabase();
  database.error = new Error("team_not_frozen");
  const executor = createStartExecutor({
    database,
    contextDatabase: gatewayDatabase(context()),
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([runtime]),
    now: () => new Date("2026-07-22T04:10:01Z"),
  });
  const outcome = await executor.execute({
    command: command(),
    auth_user: { id: AUTH_USER_ID },
    request_hash: "a".repeat(64),
  });
  assertEquals(outcome.ok, false);
  if (!outcome.ok) assertEquals(outcome.code, "team_not_frozen");
});

Deno.test("start executor preserves missing setup projection race as 409", async () => {
  const database = new FakeStartDatabase();
  database.error = new Error("expedition_setup_projection_missing");
  const executor = createStartExecutor({
    database,
    contextDatabase: gatewayDatabase(context()),
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([runtime]),
    now: () => new Date("2026-07-22T04:10:01Z"),
  });
  const outcome = await executor.execute({
    command: command(),
    auth_user: { id: AUTH_USER_ID },
    request_hash: "a".repeat(64),
  });
  assertEquals(outcome.ok, false);
  if (!outcome.ok) {
    assertEquals(outcome.code, "expedition_setup_projection_missing");
    assertEquals(outcome.status, 409);
    assertEquals(outcome.retryable, false);
  }
});
