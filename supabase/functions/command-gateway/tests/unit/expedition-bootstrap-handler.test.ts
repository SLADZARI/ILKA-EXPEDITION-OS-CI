import { assertEquals } from "jsr:@std/assert@1.0.19";

import type { BootstrapExecutor } from "../../../_shared/command-gateway/bootstrap.ts";
import { createCommandGatewayHandler } from "../../../_shared/command-gateway/handler.ts";
import { StaticRuntimeRegistry } from "../../../_shared/command-gateway/runtime-registry.ts";
import type {
  CommandEnvelope,
  GatewayDatabase,
  GatewayDependencies,
  ProcessCommandResult,
  SchemaValidator,
} from "../../../_shared/command-gateway/types.ts";

const AUTH_USER_ID = "10000000-0000-0000-0000-000000000083";
const PROFILE_ID = "20000000-0000-0000-0000-000000000083";
const EXPEDITION_ID = "50000000-0000-0000-0000-000000000083";
const MEMBERSHIP_ID = "30000000-0000-0000-0000-000000000083";
const RELEASE_ID = "60000000-0000-0000-0000-000000000083";

function command(): CommandEnvelope {
  return {
    command_id: "cmd_bootstrap_handler_01",
    command_type: "create_expedition",
    issued_at: "2026-07-21T10:00:00Z",
    actor_id: PROFILE_ID,
    actor_role: "captain",
    expedition_id: "handler_bootstrap_test",
    idempotency_key: "cmd_bootstrap_handler_01",
    payload: {
      name: "Handler Bootstrap Test",
      timezone: "Europe/Athens",
      duration_days: 12,
      day_boundary_local_time: "06:00",
    },
  };
}

function result(): ProcessCommandResult {
  return {
    outcome: "accepted",
    replayed: false,
    persisted: true,
    receipt: {
      command_id: "cmd_bootstrap_handler_01",
      expedition_id: EXPEDITION_ID,
      expedition_key: "handler_bootstrap_test",
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
      event_ids: ["evt_bootstrap_handler_01_01"],
      stream_position: 1,
      projection_version: 0,
      runtime_release_id: RELEASE_ID,
      reducer_version: "expedition_bootstrap_test_v1",
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

function database(): GatewayDatabase {
  return {
    getReceipt: async () => null,
    loadContext: async () => {
      throw new Error("bootstrap must not load an existing Expedition context");
    },
    processCommand: async () => {
      throw new Error("bootstrap must use private.bootstrap_expedition");
    },
  };
}

function dependencies(): GatewayDependencies {
  return {
    auth: { verify: async () => ({ id: AUTH_USER_ID }) },
    database: database(),
    schemas: validators(),
    runtimes: new StaticRuntimeRegistry([]),
    allowedOrigins: new Set(["http://localhost:5173"]),
    now: () => new Date("2026-07-21T10:00:00Z"),
    requestId: () => "70000000-0000-0000-0000-000000000083",
  };
}

function post(): Request {
  return new Request("http://localhost/functions/v1/command-gateway", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer valid-session",
      origin: "http://localhost:5173",
    },
    body: JSON.stringify(command()),
  });
}

Deno.test("gateway executes create_expedition before membership lookup", async () => {
  let executed = false;
  const bootstrap: BootstrapExecutor = {
    execute: async (request) => {
      executed = true;
      assertEquals(request.auth_user.id, AUTH_USER_ID);
      assertEquals(request.command.actor_id, PROFILE_ID);
      return { ok: true, result: result() };
    },
  };
  const handler = createCommandGatewayHandler(dependencies(), bootstrap);
  const response = await handler(post());
  assertEquals(response.status, 200);
  assertEquals(executed, true);
  const body = await response.json();
  assertEquals(body.data.receipt.stream_position, 1);
  assertEquals(body.data.receipt.projection_version, 0);
});

Deno.test("gateway returns stable bootstrap rejection envelope", async () => {
  const bootstrap: BootstrapExecutor = {
    execute: async () => ({
      ok: false,
      status: 409,
      code: "expedition_key_already_exists",
      message: "The Expedition key is already in use.",
      retryable: false,
    }),
  };
  const handler = createCommandGatewayHandler(dependencies(), bootstrap);
  const response = await handler(post());
  assertEquals(response.status, 409);
  const body = await response.json();
  assertEquals(body.error.code, "expedition_key_already_exists");
  assertEquals(body.error.retryable, false);
});

Deno.test("gateway fails closed when bootstrap executor is not wired", async () => {
  const handler = createCommandGatewayHandler(dependencies());
  const response = await handler(post());
  assertEquals(response.status, 503);
  const body = await response.json();
  assertEquals(body.error.code, "runtime_release_unavailable");
});
