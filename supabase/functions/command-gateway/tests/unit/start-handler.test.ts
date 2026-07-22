import { assertEquals } from "jsr:@std/assert@1.0.19";

import { createCommandGatewayHandler } from "../../../_shared/command-gateway/handler.ts";
import type { StartExecutor } from "../../../_shared/command-gateway/start.ts";
import { StaticRuntimeRegistry } from "../../../_shared/command-gateway/runtime-registry.ts";
import type {
  CommandEnvelope,
  CommandReceipt,
  GatewayDatabase,
  GatewayDependencies,
  ProcessCommandResult,
  SchemaValidator,
} from "../../../_shared/command-gateway/types.ts";

const AUTH_USER_ID = "10000000-0000-0000-0000-00000000009d";
const REQUEST_ID = "70000000-0000-0000-0000-00000000009d";
const EXPEDITION_ID = "50000000-0000-0000-0000-00000000009d";

function command(): CommandEnvelope {
  return {
    command_id: "cmd_handler_start_expedition",
    command_type: "start_expedition",
    issued_at: "2026-07-22T07:30:00Z",
    actor_id: "member_3000000000000000000000000000009d",
    actor_role: "captain",
    expedition_id: "start_handler_test",
    idempotency_key: "cmd_handler_start_expedition",
    day_number: null,
    stage_id: null,
    day_revision: null,
    payload: {},
  };
}

function receipt(current: CommandEnvelope): CommandReceipt {
  return {
    command_id: current.command_id,
    expedition_id: EXPEDITION_ID,
    expedition_key: current.expedition_id,
    command_type: current.command_type,
    actor_auth_user_id: AUTH_USER_ID,
    actor_profile_id: "20000000-0000-0000-0000-00000000009d",
    actor_membership_id: "30000000-0000-0000-0000-00000000009d",
    actor_participant_id: null,
    actor_role: "captain",
    request_hash: "a".repeat(64),
    status: "accepted",
    received_at: "2026-07-22T07:30:01Z",
    processed_at: "2026-07-22T07:30:01Z",
    event_ids: [
      "evt_handler_start_expedition_01",
      "evt_handler_start_expedition_02",
    ],
    stream_position: 11,
    projection_version: 6,
    runtime_release_id: "60000000-0000-0000-0000-00000000009d",
    reducer_version: "start_handler_test_v1",
    rejection_code: null,
    rejection_message: null,
    conflict_code: null,
  };
}

function result(current: CommandEnvelope, replayed = false): ProcessCommandResult {
  return {
    outcome: "accepted",
    replayed,
    persisted: true,
    receipt: receipt(current),
    projection_updates: [{
      projection_key: "expedition_setup_view",
      projection_version: 6,
      source_stream_position: 11,
    }],
    expected_stream_position: 9,
    current_stream_position: 11,
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

function database(storedReceipt: CommandReceipt | null = null): GatewayDatabase {
  return {
    getReceipt: async () => storedReceipt,
    loadContext: async () => {
      throw new Error("start branch must run before generic context loading");
    },
    processCommand: async () => {
      throw new Error("start branch must not call generic processCommand");
    },
  };
}

function dependencies(storedReceipt: CommandReceipt | null = null): GatewayDependencies {
  return {
    auth: { verify: async () => ({ id: AUTH_USER_ID }) },
    database: database(storedReceipt),
    schemas: validators(),
    runtimes: new StaticRuntimeRegistry([]),
    allowedOrigins: new Set(["http://localhost:5173"]),
    now: () => new Date("2026-07-22T07:30:01Z"),
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

Deno.test("gateway routes start_expedition before generic membership handling", async () => {
  const current = command();
  let calls = 0;
  const executor: StartExecutor = {
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
    undefined,
    executor,
  );
  const response = await handler(post(current));
  assertEquals(response.status, 200);
  assertEquals(calls, 1);
  assertEquals((await body(response)).request_id, REQUEST_ID);
});

Deno.test("gateway returns runtime_release_unavailable when StartExecutor is absent", async () => {
  const handler = createCommandGatewayHandler(dependencies());
  const response = await handler(post(command()));
  assertEquals(response.status, 503);
  const payload = await body(response);
  assertEquals(
    (payload.error as Record<string, unknown>).code,
    "runtime_release_unavailable",
  );
});

Deno.test("gateway maps stable StartExecutor failures", async () => {
  const executor: StartExecutor = {
    execute: async () => ({
      ok: false,
      status: 409,
      code: "team_not_frozen",
      message: "The ready team is not frozen or complete.",
      retryable: false,
    }),
  };
  const handler = createCommandGatewayHandler(
    dependencies(),
    undefined,
    undefined,
    undefined,
    executor,
  );
  const response = await handler(post(command()));
  assertEquals(response.status, 409);
  const payload = await body(response);
  assertEquals(
    (payload.error as Record<string, unknown>).code,
    "team_not_frozen",
  );
});

Deno.test("gateway returns exact start replay before StartExecutor and mutable context", async () => {
  const current = command();
  const stored = receipt(current);
  let calls = 0;
  const executor: StartExecutor = {
    execute: async () => {
      calls += 1;
      throw new Error("exact replay must not execute StartExecutor");
    },
  };
  const handler = createCommandGatewayHandler(
    dependencies(stored),
    undefined,
    undefined,
    undefined,
    executor,
  );
  const response = await handler(post(current));
  assertEquals(response.status, 200);
  assertEquals(calls, 0);
  const payload = await body(response);
  const data = payload.data as Record<string, unknown>;
  assertEquals(data.replayed, true);
  assertEquals(
    (data.receipt as Record<string, unknown>).command_id,
    current.command_id,
  );
});
