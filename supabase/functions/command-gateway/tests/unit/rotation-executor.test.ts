import { assertEquals, assertExists } from "jsr:@std/assert@1.0.19";

import { createExpeditionRotationRuntime } from "../../../_shared/engine-runtime/expedition-rotation-v1.ts";
import type { RotationDatabase } from "../../../_shared/command-gateway/rotation-database.ts";
import { createRotationExecutor } from "../../../_shared/command-gateway/rotation.ts";
import { StaticRuntimeRegistry } from "../../../_shared/command-gateway/runtime-registry.ts";
import { createSchemaValidator } from "../../../_shared/command-gateway/schema-validation.ts";
import type {
  CommandEnvelope,
  GatewayDatabase,
  GatewayExecutionContext,
  JsonValue,
  ProcessCommandResult,
} from "../../../_shared/command-gateway/types.ts";

const AUTH_USER_ID = "10000000-0000-0000-0000-00000000009d";
const PROFILE_ID = "20000000-0000-0000-0000-00000000009d";
const MEMBERSHIP_ID = "30000000-0000-0000-0000-00000000009d";
const EXPEDITION_ID = "50000000-0000-0000-0000-00000000009d";
const RELEASE_ID = "60000000-0000-0000-0000-00000000009d";
const ACTOR_ID = `member_${MEMBERSHIP_ID.replaceAll("-", "")}`;

const release = {
  id: RELEASE_ID,
  release_key: "rotation_executor_test",
  git_commit_sha: "000000000000000000000000000000000000009d",
  rules_release: "engine_v2_rotation_executor_test",
  content_release: "rotation_executor_test_v1",
  reducer_version: "rotation_executor_test_v1",
};

const runtime = createExpeditionRotationRuntime({
  ...release,
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

function command(overrides: Partial<CommandEnvelope> = {}): CommandEnvelope {
  return {
    command_id: "cmd_rotation_executor_test",
    command_type: "generate_rotation",
    issued_at: "2026-07-21T21:40:00Z",
    actor_id: ACTOR_ID,
    actor_role: "captain",
    expedition_id: "rotation_executor_test",
    idempotency_key: "cmd_rotation_executor_test",
    day_number: null,
    stage_id: null,
    day_revision: null,
    payload: {},
    ...overrides,
  };
}

function setupProjection(): Record<string, JsonValue> {
  return {
    expedition_id: "rotation_executor_test",
    expedition_status: "draft",
    team: {
      active_participant_count: 3,
      pending_invitation_count: 0,
      minimum: 3,
      maximum: 5,
      slots_remaining: 2,
    },
    participants: [1, 2, 3].map((index) => ({
      participant_id: `participant_${index.toString(16).padStart(32, "0")}`,
      display_name: `Participant ${index}`,
      participant_order: index,
      status: "active",
    })),
    invitations: [],
    rotation: {
      status: "not_generated",
      rotation_id: null,
      rules_version: null,
      assignments: [],
    },
    readiness: {
      can_generate_rotation: true,
      can_start_expedition: false,
      blockers: [{
        code: "rotation_not_generated",
        message: "The deterministic Rotation Plan has not been generated.",
        entity_id: null,
      }],
    },
    controls: {
      invite_participant: true,
      revoke_invitation: false,
      generate_rotation: true,
      start_expedition: false,
    },
    expected_projection_version: 4,
    sync_status: "synced",
  };
}

function context(
  actorRole: "captain" | "participant" = "captain",
): GatewayExecutionContext {
  return {
    expedition_id: EXPEDITION_ID,
    expedition_key: "rotation_executor_test",
    expedition_status: "draft",
    stream_position: 7,
    projection_version: 4,
    runtime_release: release,
    actor: {
      auth_user_id: AUTH_USER_ID,
      profile_id: PROFILE_ID,
      membership_id: MEMBERSHIP_ID,
      participant_id: actorRole === "captain"
        ? null
        : "70000000-0000-0000-0000-00000000009d",
      participant_key: actorRole === "captain"
        ? null
        : "participant_00000000000000000000000000000001",
      membership_role: actorRole,
    },
    projections: [{
      projection_key: "expedition_setup_view",
      projection_type: "expedition_setup_view",
      subject_id: null,
      schema_id: "https://ilka.local/schemas/expedition-setup-view.schema.json",
      schema_version: "1",
      projection: setupProjection(),
      projection_version: 4,
      source_stream_position: 7,
    }],
  };
}

function persistedResult(current: CommandEnvelope): ProcessCommandResult {
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
      received_at: "2026-07-21T21:40:01Z",
      processed_at: "2026-07-21T21:40:01Z",
      event_ids: [
        "evt_rotation_executor_test_01",
        "evt_rotation_executor_test_02",
      ],
      stream_position: 9,
      projection_version: 5,
      runtime_release_id: RELEASE_ID,
      reducer_version: release.reducer_version,
      rejection_code: null,
      rejection_message: null,
      conflict_code: null,
    },
    projection_updates: [{
      projection_key: "expedition_setup_view",
      projection_version: 5,
      source_stream_position: 9,
    }],
    expected_stream_position: 7,
    current_stream_position: 9,
  };
}

class FakeRotationDatabase implements RotationDatabase {
  calls: Array<Record<string, JsonValue>> = [];
  currentCommand = command();
  error: Error | null = null;

  async generateRotation(
    request: Record<string, JsonValue>,
  ): Promise<ProcessCommandResult> {
    this.calls.push(request);
    if (this.error) throw this.error;
    return persistedResult(this.currentCommand);
  }
}

function gatewayDatabase(
  currentContext: GatewayExecutionContext | null,
): GatewayDatabase {
  return {
    getReceipt: async () => null,
    loadContext: async () => currentContext,
    processCommand: async () => {
      throw new Error("generic processCommand must not handle generate_rotation");
    },
  };
}

Deno.test("rotation executor prepares one trusted atomic wrapper request", async () => {
  const current = command();
  const database = new FakeRotationDatabase();
  database.currentCommand = current;
  const executor = createRotationExecutor({
    database,
    contextDatabase: gatewayDatabase(context()),
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([runtime]),
    now: () => new Date("2026-07-21T21:40:01Z"),
  });

  const outcome = await executor.execute({
    command: current,
    auth_user: { id: AUTH_USER_ID },
    request_hash: "a".repeat(64),
  });

  assertEquals(outcome.ok, true);
  assertEquals(database.calls.length, 1);
  const outer = database.calls[0];
  const transition = outer.expedition_transition as Record<string, JsonValue>;
  assertEquals(transition.expedition_id, EXPEDITION_ID);
  assertEquals(transition.expected_status, "draft");
  assertEquals(transition.next_status, "ready");
  assertEquals(transition.rules_version, 2);
  assertEquals(
    typeof transition.rotation_id === "string" &&
      /^rotation_[a-f0-9]{32}$/.test(transition.rotation_id),
    true,
  );

  const process = outer.process_command_request as Record<string, JsonValue>;
  const nestedCommand = process.command as Record<string, JsonValue>;
  assertEquals(nestedCommand.payload, {});
  const events = process.events as Array<Record<string, JsonValue>>;
  assertEquals(events.map((event) => event.event_type), [
    "rotation.generated",
    "expedition.ready",
  ]);
  const projectionMutations = process.projection_mutations as Array<
    Record<string, JsonValue>
  >;
  assertEquals(projectionMutations.length, 1);
});

Deno.test("rotation executor rejects non-Captain context before persistence", async () => {
  const database = new FakeRotationDatabase();
  const executor = createRotationExecutor({
    database,
    contextDatabase: gatewayDatabase(context("participant")),
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([runtime]),
    now: () => new Date("2026-07-21T21:40:01Z"),
  });
  const outcome = await executor.execute({
    command: command(),
    auth_user: { id: AUTH_USER_ID },
    request_hash: "a".repeat(64),
  });
  assertEquals(outcome.ok, false);
  if (!outcome.ok) {
    assertEquals(outcome.status, 403);
    assertEquals(outcome.code, "active_captain_membership_required");
  }
  assertEquals(database.calls.length, 0);
});

Deno.test("rotation executor rejects spoofed actor before persistence", async () => {
  const database = new FakeRotationDatabase();
  const executor = createRotationExecutor({
    database,
    contextDatabase: gatewayDatabase(context()),
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([runtime]),
    now: () => new Date("2026-07-21T21:40:01Z"),
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

Deno.test("rotation executor requires exact pinned rotation runtime", async () => {
  const database = new FakeRotationDatabase();
  const executor = createRotationExecutor({
    database,
    contextDatabase: gatewayDatabase(context()),
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([]),
    now: () => new Date("2026-07-21T21:40:01Z"),
  });
  const outcome = await executor.execute({
    command: command(),
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

Deno.test("rotation executor maps stable wrapper failures", async () => {
  const database = new FakeRotationDatabase();
  database.error = new Error("pending_invitations_exist");
  const executor = createRotationExecutor({
    database,
    contextDatabase: gatewayDatabase(context()),
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([runtime]),
    now: () => new Date("2026-07-21T21:40:01Z"),
  });
  const outcome = await executor.execute({
    command: command(),
    auth_user: { id: AUTH_USER_ID },
    request_hash: "a".repeat(64),
  });
  assertEquals(outcome.ok, false);
  if (!outcome.ok) {
    assertEquals(outcome.status, 409);
    assertEquals(outcome.code, "pending_invitations_exist");
  }
});

Deno.test("rotation executor rejects browser-controlled payload", async () => {
  const database = new FakeRotationDatabase();
  const executor = createRotationExecutor({
    database,
    contextDatabase: gatewayDatabase(context()),
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([runtime]),
    now: () => new Date("2026-07-21T21:40:01Z"),
  });
  const outcome = await executor.execute({
    command: command({ payload: { rules_version: 99 } }),
    auth_user: { id: AUTH_USER_ID },
    request_hash: "a".repeat(64),
  });
  assertEquals(outcome.ok, false);
  if (!outcome.ok) assertEquals(outcome.code, "validation_failed");
  assertEquals(database.calls.length, 0);
});

Deno.test("accepted rotation exposes persisted result", async () => {
  const database = new FakeRotationDatabase();
  const executor = createRotationExecutor({
    database,
    contextDatabase: gatewayDatabase(context()),
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([runtime]),
    now: () => new Date("2026-07-21T21:40:01Z"),
  });
  const outcome = await executor.execute({
    command: command(),
    auth_user: { id: AUTH_USER_ID },
    request_hash: "a".repeat(64),
  });
  assertEquals(outcome.ok, true);
  if (outcome.ok) assertExists(outcome.result.receipt);
});
