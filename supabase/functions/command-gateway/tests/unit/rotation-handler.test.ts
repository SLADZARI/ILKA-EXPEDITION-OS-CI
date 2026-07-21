import { assertEquals } from "jsr:@std/assert@1.0.19";

import { createCommandGatewayHandler } from "../../../_shared/command-gateway/handler.ts";
import type { RotationExecutor } from "../../../_shared/command-gateway/rotation.ts";
import { StaticRuntimeRegistry } from "../../../_shared/command-gateway/runtime-registry.ts";
import type {
  CommandEnvelope,
  GatewayDatabase,
  GatewayDependencies,
  ProcessCommandResult,
  SchemaValidator,
} from "../../../_shared/command-gateway/types.ts";

const AUTH_USER_ID = "10000000-0000-0000-0000-00000000009e";
const REQUEST_ID = "70000000-0000-0000-0000-00000000009e";

function command(): CommandEnvelope {
  return {
    command_id: "cmd_handler_generate_rotation",
    command_type: "generate_rotation",
    issued_at: "2026-07-21T21:50:00Z",
    actor_id: "member_3000000000000000000000000000009e",
    actor_role: "captain",
    expedition_id: "rotation_handler_test",
    idempotency_key: "cmd_handler_generate_rotation",
    day_number: null,
    stage_id: null,
    day_revision: null,
    payload: {},
  };
}

function result(current: CommandEnvelope): ProcessCommandResult {
  return {
    outcome: "accepted",
    replayed: false,
    persisted: true,
    receipt: {
      command_id: current.command_id,
      expedition_id: "50000000-0000-0000-0000-00000000009e",
      expedition_key: current.expedition_id,
      command_type: current.command_type,
      actor_auth_user_id: AUTH_USER_ID,
      actor_profile_id: "20000000-0000-0000-0000-00000000009e",
      actor_membership_id: "30000000-0000-0000-0000-00000000009e",
      actor_participant_id: null,
      actor_role: "captain",
      request_hash: "a".repeat(64),
      status: "accepted",
      received_at: "2026-07-21T21:50:01Z",
      processed_at: "2026-07-21T21:50:01Z",
      event_ids: [
        "evt_handler_generate_rotation_01",
        "evt_handler_generate_rotation_02",
      ],
      stream_position: 9,
      projection_version: 5,
      runtime_release_id: "60000000-0000-0000-0000-00000000009e",
      reducer_version: "rotation_handler_test_v1",
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
      throw new Error("rotation branch must run before generic context loading");
    },
    processCommand: async () => {
      throw new Error("rotation branch must not call generic processCommand");
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
    now: () => new Date("2026-07-21T21:50:01Z"),
    requestId: () => REQUEST_ID,
  };
}

function post(current: CommandEnvelope): Request {
  return new Request("http://localhost/functions/v1/command-gateway", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer valid-session",
      origin: "http://localhost:5173",
    },
    body: JSON.stringify(current),
  });
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

Deno.test("gateway routes generate_rotation before generic membership handling", async () => {
  const current = command();
  let calls = 0;
  const executor: RotationExecutor = {
    execute: async (request) => {
      calls += 1;
      assertEquals(request.command.command_id, current.command_id);
      assertEquals(request.auth_user.id, AUTH_USER_ID);
      return { ok: true, result: result(current) };
    },
  };
  const handler = createCommandGatewayHandler(
    dependencies(),
    undefined,
    undefined,
    executor,
  );
  const response = await handler(post(current));
  assertEquals(response.status, 200);
  assertEquals(calls, 1);
  assertEquals((await body(response)).request_id, REQUEST_ID);
});

Deno.test("gateway returns runtime_release_unavailable when RotationExecutor is absent", async () => {
  const handler = createCommandGatewayHandler(dependencies());
  const response = await handler(post(command()));
  assertEquals(response.status, 503);
  const payload = await body(response);
  assertEquals(
    (payload.error as Record<string, unknown>).code,
    "runtime_release_unavailable",
  );
});

Deno.test("gateway maps stable RotationExecutor failures", async () => {
  const executor: RotationExecutor = {
    execute: async () => ({
      ok: false,
      status: 409,
      code: "pending_invitations_exist",
      message: "All pending invitations must reach a terminal state first.",
      retryable: false,
    }),
  };
  const handler = createCommandGatewayHandler(
    dependencies(),
    undefined,
    undefined,
    executor,
  );
  const response = await handler(post(command()));
  assertEquals(response.status, 409);
  const payload = await body(response);
  assertEquals(
    (payload.error as Record<string, unknown>).code,
    "pending_invitations_exist",
  );
});
