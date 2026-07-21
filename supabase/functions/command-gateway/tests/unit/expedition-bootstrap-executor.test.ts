import { assertEquals, assertExists } from "jsr:@std/assert@1.0.19";

import type { BootstrapDatabase } from "../../../_shared/command-gateway/bootstrap-database.ts";
import { createExpeditionBootstrapExecutor } from "../../../_shared/command-gateway/bootstrap.ts";
import { StaticRuntimeRegistry } from "../../../_shared/command-gateway/runtime-registry.ts";
import type {
  CommandEnvelope,
  JsonValue,
  ProcessCommandResult,
  SchemaValidator,
} from "../../../_shared/command-gateway/types.ts";
import { createExpeditionBootstrapRuntime } from "../../../_shared/engine-runtime/expedition-bootstrap-v1.ts";

const AUTH_USER_ID = "10000000-0000-0000-0000-000000000082";
const PROFILE_ID = "20000000-0000-0000-0000-000000000082";
const EXPEDITION_ID = "50000000-0000-0000-0000-000000000082";
const MEMBERSHIP_ID = "30000000-0000-0000-0000-000000000082";
const RELEASE_ID = "60000000-0000-0000-0000-000000000082";

const runtime = createExpeditionBootstrapRuntime({
  release_key: "expedition_bootstrap_test_v1",
  git_commit_sha: "0000000000000000000000000000000000000082",
  rules_release: "engine_v9_bootstrap_test",
  content_release: "bootstrap_content_test_v1",
  reducer_version: "expedition_bootstrap_test_v1",
  duration_days: 12,
  recovery_days_available: 1,
});

const release = {
  id: RELEASE_ID,
  release_key: runtime.release_key,
  git_commit_sha: runtime.git_commit_sha,
  rules_release: runtime.rules_release,
  content_release: runtime.content_release,
  reducer_version: runtime.reducer_version,
};

function command(overrides: Partial<CommandEnvelope> = {}): CommandEnvelope {
  return {
    command_id: "cmd_bootstrap_executor_01",
    command_type: "create_expedition",
    issued_at: "2026-07-21T10:00:00Z",
    actor_id: PROFILE_ID,
    actor_role: "captain",
    expedition_id: "executor_bootstrap_test",
    idempotency_key: "cmd_bootstrap_executor_01",
    payload: {
      name: " Executor Bootstrap Test ",
      timezone: "Europe/Athens",
      duration_days: 12,
      day_boundary_local_time: "06:00",
    },
    ...overrides,
  };
}

function acceptedResult(): ProcessCommandResult {
  return {
    outcome: "accepted",
    replayed: false,
    persisted: true,
    receipt: {
      command_id: "cmd_bootstrap_executor_01",
      expedition_id: EXPEDITION_ID,
      expedition_key: "executor_bootstrap_test",
      command_type: "create_expedition",
      actor_auth_user_id: AUTH_USER_ID,
      actor_profile_id: PROFILE_ID,
      actor_membership_id: MEMBERSHIP_ID,
      actor_participant_id: null,
      actor_role: "captain",
      request_hash: "a".repeat(64),
      status: "accepted",
      received_at: "2026-07-21T10:00:00Z",
      processed_at: "2026-07-21T10:00:01Z",
      event_ids: ["evt_bootstrap_executor_01_01"],
      stream_position: 1,
      projection_version: 0,
      runtime_release_id: RELEASE_ID,
      reducer_version: runtime.reducer_version,
      rejection_code: null,
      rejection_message: null,
      conflict_code: null,
    },
    projection_updates: [],
    expected_stream_position: 0,
    current_stream_position: 1,
  };
}

function validators(): SchemaValidator {
  return {
    validateCommand: () => [],
    validatePreparedEvent: () => [],
    validateProjection: () => [],
    validateProcessRequest: () => [],
    validateProcessResult: () => [],
  };
}

function database(
  overrides: Partial<BootstrapDatabase> = {},
): BootstrapDatabase {
  return {
    loadActiveProfile: async () => ({
      id: PROFILE_ID,
      auth_user_id: AUTH_USER_ID,
    }),
    loadRuntimeRelease: async () => release,
    bootstrapExpedition: async () => acceptedResult(),
    ...overrides,
  };
}

function executor(
  databaseOverrides: Partial<BootstrapDatabase> = {},
) {
  const ids = [EXPEDITION_ID, MEMBERSHIP_ID];
  return createExpeditionBootstrapExecutor({
    database: database(databaseOverrides),
    schemas: validators(),
    runtimes: new StaticRuntimeRegistry([runtime]),
    defaultRuntimeReleaseKey: runtime.release_key,
    now: () => new Date("2026-07-21T10:00:01Z"),
    uuid: () => ids.shift()!,
  });
}

Deno.test("bootstrap executor prepares the atomic request and returns accepted result", async () => {
  const capturedRequests: Array<Record<string, JsonValue>> = [];
  const current = executor({
    bootstrapExpedition: async (request) => {
      capturedRequests.push(request);
      return acceptedResult();
    },
  });

  const outcome = await current.execute({
    command: command(),
    auth_user: { id: AUTH_USER_ID },
    request_hash: "a".repeat(64),
  });

  assertEquals(outcome.ok, true);
  assertEquals(capturedRequests.length, 1);
  const captured = capturedRequests[0];
  assertExists(captured);
  const expedition = captured.expedition as Record<string, JsonValue>;
  const membership = captured.captain_membership as Record<string, JsonValue>;
  const process = captured.process_command_request as Record<string, JsonValue>;
  const canonicalCommand = process.command as Record<string, JsonValue>;
  const actor = process.actor_context as Record<string, JsonValue>;

  assertEquals(expedition.id, EXPEDITION_ID);
  assertEquals(expedition.name, "Executor Bootstrap Test");
  assertEquals(expedition.duration_days, 12);
  assertEquals(expedition.recovery_days_available, 1);
  assertEquals(membership.id, MEMBERSHIP_ID);
  assertEquals(membership.role, "captain");
  assertEquals(process.expected_stream_position, 0);
  assertEquals(process.projection_mutations, []);
  assertEquals(
    canonicalCommand.actor_id,
    `member_${MEMBERSHIP_ID.replaceAll("-", "")}`,
  );
  assertEquals(actor.participant_id, null);
});

Deno.test("bootstrap executor requires active Profile ownership", async () => {
  const missing = createExpeditionBootstrapExecutor({
    database: database({ loadActiveProfile: async () => null }),
    schemas: validators(),
    runtimes: new StaticRuntimeRegistry([runtime]),
    defaultRuntimeReleaseKey: runtime.release_key,
    now: () => new Date("2026-07-21T10:00:01Z"),
    uuid: () => crypto.randomUUID(),
  });
  const missingOutcome = await missing.execute({
    command: command(),
    auth_user: { id: AUTH_USER_ID },
    request_hash: "a".repeat(64),
  });
  assertEquals(missingOutcome.ok, false);
  if (!missingOutcome.ok) assertEquals(missingOutcome.code, "active_profile_required");

  const mismatch = await executor().execute({
    command: command({ actor_id: "20000000-0000-0000-0000-000000000099" }),
    auth_user: { id: AUTH_USER_ID },
    request_hash: "a".repeat(64),
  });
  assertEquals(mismatch.ok, false);
  if (!mismatch.ok) assertEquals(mismatch.code, "profile_actor_mismatch");
});

Deno.test("bootstrap executor rejects unavailable exact runtime", async () => {
  const unavailable = createExpeditionBootstrapExecutor({
    database: database(),
    schemas: validators(),
    runtimes: new StaticRuntimeRegistry([]),
    defaultRuntimeReleaseKey: runtime.release_key,
    now: () => new Date("2026-07-21T10:00:01Z"),
    uuid: () => crypto.randomUUID(),
  });
  const outcome = await unavailable.execute({
    command: command(),
    auth_user: { id: AUTH_USER_ID },
    request_hash: "a".repeat(64),
  });
  assertEquals(outcome.ok, false);
  if (!outcome.ok) {
    assertEquals(outcome.code, "runtime_release_unavailable");
    assertEquals(outcome.retryable, true);
  }
});

Deno.test("bootstrap executor maps deterministic transaction failures", async () => {
  const collision = await executor({
    bootstrapExpedition: async () => {
      throw new Error("expedition_key_already_exists");
    },
  }).execute({
    command: command(),
    auth_user: { id: AUTH_USER_ID },
    request_hash: "a".repeat(64),
  });
  assertEquals(collision.ok, false);
  if (!collision.ok) {
    assertEquals(collision.status, 409);
    assertEquals(collision.code, "expedition_key_already_exists");
  }
});
