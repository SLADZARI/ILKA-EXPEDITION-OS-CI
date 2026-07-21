import { assertEquals } from "jsr:@std/assert@1.0.19";

import { createExpeditionBootstrapRuntime } from "../../../_shared/engine-runtime/expedition-bootstrap-v1.ts";
import type {
  CommandEnvelope,
  GatewayExecutionContext,
  RuntimeInput,
} from "../../../_shared/command-gateway/types.ts";

const AUTH_USER_ID = "10000000-0000-0000-0000-000000000081";
const PROFILE_ID = "20000000-0000-0000-0000-000000000081";
const MEMBERSHIP_ID = "30000000-0000-0000-0000-000000000081";
const EXPEDITION_UUID = "50000000-0000-0000-0000-000000000081";
const RELEASE_ID = "60000000-0000-0000-0000-000000000081";
const ACTOR_ID = `member_${MEMBERSHIP_ID.replaceAll("-", "")}`;

const runtime = createExpeditionBootstrapRuntime({
  release_key: "expedition_bootstrap_test_v1",
  git_commit_sha: "0000000000000000000000000000000000000081",
  rules_release: "engine_v9_bootstrap_test",
  content_release: "bootstrap_content_test_v1",
  reducer_version: "expedition_bootstrap_test_v1",
  duration_days: 12,
  recovery_days_available: 1,
});

function command(overrides: Partial<CommandEnvelope> = {}): CommandEnvelope {
  return {
    command_id: "cmd_bootstrap_runtime_01",
    command_type: "create_expedition",
    issued_at: "2026-07-21T10:00:00Z",
    actor_id: ACTOR_ID,
    actor_role: "captain",
    expedition_id: "runtime_bootstrap_test",
    idempotency_key: "cmd_bootstrap_runtime_01",
    payload: {
      name: "Runtime Bootstrap Test",
      timezone: "Europe/Athens",
      duration_days: 12,
      day_boundary_local_time: "06:00",
    },
    day_number: null,
    stage_id: null,
    day_revision: null,
    ...overrides,
  };
}

function context(
  overrides: Partial<GatewayExecutionContext> = {},
): GatewayExecutionContext {
  return {
    expedition_id: EXPEDITION_UUID,
    expedition_key: "runtime_bootstrap_test",
    expedition_status: "absent",
    stream_position: 0,
    projection_version: 0,
    runtime_release: {
      id: RELEASE_ID,
      release_key: runtime.release_key,
      git_commit_sha: runtime.git_commit_sha,
      rules_release: runtime.rules_release,
      content_release: runtime.content_release,
      reducer_version: runtime.reducer_version,
    },
    actor: {
      auth_user_id: AUTH_USER_ID,
      profile_id: PROFILE_ID,
      membership_id: MEMBERSHIP_ID,
      participant_id: null,
      participant_key: null,
      membership_role: "captain",
    },
    projections: [],
    ...overrides,
  };
}

function input(
  commandOverrides: Partial<CommandEnvelope> = {},
  contextOverrides: Partial<GatewayExecutionContext> = {},
): RuntimeInput {
  return {
    command: command(commandOverrides),
    actor_id: ACTOR_ID,
    actor_role: "captain",
    context: context(contextOverrides),
    received_at: "2026-07-21T10:00:01Z",
  };
}

Deno.test("bootstrap reducer emits one canonical expedition.created event", async () => {
  const result = await runtime.reduce(input());
  assertEquals(result.status, "accepted");
  assertEquals(result.projection_mutations, []);
  assertEquals(result.rejection, null);
  assertEquals(result.events.length, 1);
  assertEquals(result.events[0], {
    event_id: "evt_bootstrap_runtime_01_01",
    event_type: "expedition.created",
    occurred_at: "2026-07-21T10:00:00Z",
    recorded_at: "2026-07-21T10:00:01Z",
    actor_id: ACTOR_ID,
    actor_role: "captain",
    expedition_id: "runtime_bootstrap_test",
    day_number: null,
    stage_id: null,
    day_revision: null,
    command_id: "cmd_bootstrap_runtime_01",
    idempotency_key: "cmd_bootstrap_runtime_01",
    schema_version: 1,
    payload: {
      name: "Runtime Bootstrap Test",
      timezone: "Europe/Athens",
      duration_days: 12,
      recovery_days_available: 1,
      day_boundary_local_time: "06:00",
    },
  });
});

Deno.test("bootstrap reducer rejects a duration that differs from runtime policy", async () => {
  const result = await runtime.reduce(input({
    payload: {
      name: "Runtime Bootstrap Test",
      timezone: "Europe/Athens",
      duration_days: 10,
      day_boundary_local_time: "06:00",
    },
  }));
  assertEquals(result.status, "rejected");
  assertEquals(result.rejection?.code, "validation_failed");
});

Deno.test("bootstrap reducer rejects invalid IANA timezone", async () => {
  const result = await runtime.reduce(input({
    payload: {
      name: "Runtime Bootstrap Test",
      timezone: "Mars/Olympus",
      duration_days: 12,
      day_boundary_local_time: "06:00",
    },
  }));
  assertEquals(result.status, "rejected");
  assertEquals(result.rejection?.code, "invalid_timezone");
});

Deno.test("bootstrap reducer rejects non-Captain and existing aggregate context", async () => {
  const denied = await runtime.reduce({
    ...input(),
    actor_role: "participant",
  });
  assertEquals(denied.status, "rejected");
  assertEquals(denied.rejection?.code, "permission_denied");

  const existing = await runtime.reduce(input({}, { expedition_status: "draft" }));
  assertEquals(existing.status, "rejected");
  assertEquals(existing.rejection?.code, "invalid_state");
});
