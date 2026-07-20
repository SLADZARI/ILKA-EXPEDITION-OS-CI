import {
  assertEquals,
  assertExists,
} from "jsr:@std/assert@1.0.19";

import { AuthServiceError } from "../../../_shared/command-gateway/auth.ts";
import { commandRequestHash } from "../../../_shared/command-gateway/canonical-json.ts";
import { createCommandGatewayHandler } from "../../../_shared/command-gateway/handler.ts";
import { StaticRuntimeRegistry } from "../../../_shared/command-gateway/runtime-registry.ts";
import type {
  CommandEnvelope,
  GatewayDatabase,
  GatewayDependencies,
  GatewayExecutionContext,
  ProcessCommandResult,
  RuntimeBundle,
  SchemaValidator,
} from "../../../_shared/command-gateway/types.ts";

const AUTH_USER_ID = "10000000-0000-0000-0000-000000000001";
const PROFILE_ID = "20000000-0000-0000-0000-000000000001";
const MEMBERSHIP_ID = "30000000-0000-0000-0000-000000000001";
const PARTICIPANT_ID = "40000000-0000-0000-0000-000000000001";
const EXPEDITION_ID = "50000000-0000-0000-0000-000000000001";
const RELEASE_ID = "60000000-0000-0000-0000-000000000001";
const REQUEST_ID = "70000000-0000-0000-0000-000000000001";

function command(overrides: Partial<CommandEnvelope> = {}): CommandEnvelope {
  return {
    command_id: "cmd_gateway_01",
    command_type: "complete_task",
    issued_at: "2026-07-20T21:00:00Z",
    actor_id: "participant_01",
    actor_role: "participant",
    expedition_id: "gateway_test",
    idempotency_key: "cmd_gateway_01",
    payload: { task_id: "task_01" },
    ...overrides,
  };
}

function context(
  overrides: Partial<GatewayExecutionContext> = {},
): GatewayExecutionContext {
  return {
    expedition_id: EXPEDITION_ID,
    expedition_key: "gateway_test",
    expedition_status: "active",
    stream_position: 4,
    projection_version: 2,
    runtime_release: {
      id: RELEASE_ID,
      release_key: "gateway_test_release",
      git_commit_sha: "0123456789012345678901234567890123456789",
      rules_release: "rules-gateway-test",
      content_release: "content-gateway-test",
      reducer_version: "reducer-gateway-test",
    },
    actor: {
      auth_user_id: AUTH_USER_ID,
      profile_id: PROFILE_ID,
      membership_id: MEMBERSHIP_ID,
      participant_id: PARTICIPANT_ID,
      participant_key: "participant_01",
      membership_role: "participant",
    },
    projections: [],
    ...overrides,
  };
}

function result(
  overrides: Partial<ProcessCommandResult> = {},
): ProcessCommandResult {
  return {
    outcome: "accepted",
    replayed: false,
    persisted: true,
    receipt: {
      command_id: "cmd_gateway_01",
      expedition_id: EXPEDITION_ID,
      expedition_key: "gateway_test",
      command_type: "complete_task",
      actor_auth_user_id: AUTH_USER_ID,
      actor_profile_id: PROFILE_ID,
      actor_membership_id: MEMBERSHIP_ID,
      actor_participant_id: PARTICIPANT_ID,
      actor_role: "participant",
      request_hash: "a".repeat(64),
      status: "accepted",
      received_at: "2026-07-20T21:00:00.000Z",
      processed_at: "2026-07-20T21:00:00.000Z",
      event_ids: ["evt_gateway_01"],
      stream_position: 5,
      projection_version: 3,
      runtime_release_id: RELEASE_ID,
      reducer_version: "reducer-gateway-test",
      rejection_code: null,
      rejection_message: null,
      conflict_code: null,
    },
    projection_updates: [],
    expected_stream_position: 4,
    current_stream_position: 5,
    ...overrides,
  };
}

function validators(overrides: Partial<SchemaValidator> = {}): SchemaValidator {
  return {
    validateCommand: () => [],
    validatePreparedEvent: () => [],
    validateProcessRequest: () => [],
    validateProcessResult: () => [],
    ...overrides,
  };
}

function runtime(
  overrides: Partial<RuntimeBundle> = {},
): RuntimeBundle {
  return {
    release_key: "gateway_test_release",
    git_commit_sha: "0123456789012345678901234567890123456789",
    rules_release: "rules-gateway-test",
    content_release: "content-gateway-test",
    reducer_version: "reducer-gateway-test",
    resolveActorRole: async (input) => input.actor_role,
    reduce: async (input) => ({
      status: "accepted",
      events: [{
        event_id: "evt_gateway_01",
        event_type: "task.completed",
        occurred_at: input.received_at,
        recorded_at: input.received_at,
        actor_id: input.actor_id,
        actor_role: input.actor_role,
        expedition_id: input.context.expedition_key,
        command_id: input.command.command_id,
        idempotency_key: input.command.command_id,
        schema_version: 1,
        payload: input.command.payload,
      }],
      projection_mutations: [],
      rejection: null,
    }),
    ...overrides,
  };
}

function database(overrides: Partial<GatewayDatabase> = {}): GatewayDatabase {
  return {
    getReceipt: async () => null,
    loadContext: async () => context(),
    processCommand: async () => result(),
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<GatewayDependencies> = {},
): GatewayDependencies {
  const bundle = runtime();
  return {
    auth: { verify: async () => ({ id: AUTH_USER_ID }) },
    database: database(),
    schemas: validators(),
    runtimes: new StaticRuntimeRegistry([bundle]),
    allowedOrigins: new Set(["http://localhost:5173"]),
    now: () => new Date("2026-07-20T21:00:00Z"),
    requestId: () => REQUEST_ID,
    ...overrides,
  };
}

function post(body: unknown, headers: HeadersInit = {}): Request {
  return new Request("http://localhost/functions/v1/command-gateway", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer valid-session",
      origin: "http://localhost:5173",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

Deno.test("gateway answers an allowed CORS preflight", async () => {
  const handler = createCommandGatewayHandler(dependencies());
  const response = await handler(new Request(
    "http://localhost/functions/v1/command-gateway",
    { method: "OPTIONS", headers: { origin: "http://localhost:5173" } },
  ));
  assertEquals(response.status, 204);
  assertEquals(
    response.headers.get("access-control-allow-origin"),
    "http://localhost:5173",
  );
});

Deno.test("gateway rejects disallowed origins before processing", async () => {
  const handler = createCommandGatewayHandler(dependencies());
  const response = await handler(post(command(), { origin: "https://evil.test" }));
  assertEquals(response.status, 403);
  assertEquals((await json(response)).error, {
    code: "origin_not_allowed",
    message: "The request origin is not allowed.",
    retryable: false,
  });
});

Deno.test("gateway rejects malformed JSON", async () => {
  const handler = createCommandGatewayHandler(dependencies());
  const response = await handler(post("{"));
  assertEquals(response.status, 400);
  const body = await json(response);
  assertEquals((body.error as Record<string, unknown>).code, "invalid_json");
});

Deno.test("gateway requires a valid authenticated session", async () => {
  const handler = createCommandGatewayHandler(dependencies({
    auth: { verify: async () => null },
  }));
  const response = await handler(post(command()));
  assertEquals(response.status, 401);
  const body = await json(response);
  assertEquals(
    (body.error as Record<string, unknown>).code,
    "authentication_required",
  );
});

Deno.test("gateway maps authentication service failures to retryable 503", async () => {
  const handler = createCommandGatewayHandler(dependencies({
    auth: { verify: async () => {
      throw new AuthServiceError();
    } },
  }));
  const response = await handler(post(command()));
  assertEquals(response.status, 503);
  const body = await json(response);
  assertEquals(
    (body.error as Record<string, unknown>).code,
    "authentication_service_unavailable",
  );
});

Deno.test("exact replay returns the original receipt before membership/runtime checks", async () => {
  const current = command();
  const hash = await commandRequestHash(current);
  const replayed = result({
    replayed: true,
    receipt: { ...result().receipt, request_hash: hash },
  });
  const handler = createCommandGatewayHandler(dependencies({
    database: database({
      getReceipt: async () => ({
        expedition_key: current.expedition_id,
        request_hash: hash,
        result: replayed,
      }),
      loadContext: async () => {
        throw new Error("replay must not load current membership");
      },
    }),
    runtimes: new StaticRuntimeRegistry([]),
  }));
  const response = await handler(post(current));
  assertEquals(response.status, 200);
  const body = await json(response);
  assertEquals(
    ((body.data as Record<string, unknown>).replayed),
    true,
  );
});

Deno.test("exact replay is available only to the original authenticated actor", async () => {
  const current = command();
  const hash = await commandRequestHash(current);
  const stored = result({
    replayed: true,
    receipt: { ...result().receipt, request_hash: hash },
  });
  const handler = createCommandGatewayHandler(dependencies({
    auth: { verify: async () => ({ id: "90000000-0000-0000-0000-000000000001" }) },
    database: database({
      getReceipt: async () => ({
        expedition_key: current.expedition_id,
        request_hash: hash,
        result: stored,
      }),
    }),
  }));
  const response = await handler(post(current));
  assertEquals(response.status, 403);
  const body = await json(response);
  assertEquals(
    (body.error as Record<string, unknown>).code,
    "receipt_actor_mismatch",
  );
});

Deno.test("reused command ID with another normalized request is rejected", async () => {
  const handler = createCommandGatewayHandler(dependencies({
    database: database({
      getReceipt: async () => ({
        expedition_key: "gateway_test",
        request_hash: "f".repeat(64),
        result: result(),
      }),
    }),
  }));
  const response = await handler(post(command()));
  assertEquals(response.status, 409);
  const body = await json(response);
  assertEquals(
    (body.error as Record<string, unknown>).code,
    "idempotency_key_reused_with_different_payload",
  );
});

Deno.test("new command requires an active Expedition membership", async () => {
  const handler = createCommandGatewayHandler(dependencies({
    database: database({
      loadContext: async () => context({ actor: null }),
    }),
  }));
  const response = await handler(post(command()));
  assertEquals(response.status, 403);
  const body = await json(response);
  assertEquals(
    (body.error as Record<string, unknown>).code,
    "active_membership_required",
  );
});

Deno.test("gateway rejects actor ID spoofing", async () => {
  const handler = createCommandGatewayHandler(dependencies());
  const response = await handler(post(command({ actor_id: "participant_99" })));
  assertEquals(response.status, 403);
  const body = await json(response);
  assertEquals(
    (body.error as Record<string, unknown>).code,
    "actor_spoofing_detected",
  );
});

Deno.test("new command waits for the exact pinned runtime bundle", async () => {
  const handler = createCommandGatewayHandler(dependencies({
    runtimes: new StaticRuntimeRegistry([]),
  }));
  const response = await handler(post(command()));
  assertEquals(response.status, 503);
  const body = await json(response);
  assertEquals(
    (body.error as Record<string, unknown>).code,
    "runtime_release_unavailable",
  );
  assertEquals((body.error as Record<string, unknown>).retryable, true);
});

Deno.test("Product Captain claim must be confirmed by the pinned runtime", async () => {
  const rejectingRuntime = runtime({
    resolveActorRole: async () => "participant",
  });
  const handler = createCommandGatewayHandler(dependencies({
    runtimes: new StaticRuntimeRegistry([rejectingRuntime]),
  }));
  const response = await handler(post(command({ actor_role: "product_captain" })));
  assertEquals(response.status, 403);
  const body = await json(response);
  assertEquals(
    (body.error as Record<string, unknown>).code,
    "actor_role_spoofing_detected",
  );
});

Deno.test("generated command actor matrix rejects unsupported membership roles", async () => {
  const shoreMembership = "30000000-0000-0000-0000-000000000099";
  const shoreActorId = `member_${shoreMembership.replaceAll("-", "")}`;
  const handler = createCommandGatewayHandler(dependencies({
    database: database({
      loadContext: async () => context({
        actor: {
          auth_user_id: AUTH_USER_ID,
          profile_id: PROFILE_ID,
          membership_id: shoreMembership,
          participant_id: null,
          participant_key: null,
          membership_role: "shore_operator",
        },
      }),
    }),
  }));
  const response = await handler(post(command({
    actor_id: shoreActorId,
    actor_role: "shore_operator",
  })));
  assertEquals(response.status, 403);
  const body = await json(response);
  assertEquals(
    (body.error as Record<string, unknown>).code,
    "permission_denied",
  );
});

Deno.test("accepted runtime result is sent to the atomic transaction", async () => {
  let captured: Record<string, unknown> | null = null;
  const handler = createCommandGatewayHandler(dependencies({
    database: database({
      processCommand: async (request) => {
        captured = request;
        return result();
      },
    }),
  }));
  const response = await handler(post(command()));
  assertEquals(response.status, 200);
  assertExists(captured);
  const persistedCommand = captured.command as Record<string, unknown>;
  assertEquals(persistedCommand.actor_id, "participant_01");
  assertEquals(persistedCommand.actor_role, "participant");
  assertEquals((captured.request_hash as string).length, 64);
});

Deno.test("stream conflict maps to HTTP 409", async () => {
  const conflict = result({
    outcome: "conflict",
    persisted: false,
    current_stream_position: 7,
    receipt: {
      ...result().receipt,
      status: "conflict",
      stream_position: 7,
      event_ids: [],
      conflict_code: "stream_position_conflict",
    },
  });
  const handler = createCommandGatewayHandler(dependencies({
    database: database({ processCommand: async () => conflict }),
  }));
  const response = await handler(post(command()));
  assertEquals(response.status, 409);
  const body = await json(response);
  assertEquals((body.data as Record<string, unknown>).outcome, "conflict");
});

Deno.test("invalid prepared event is never sent to persistence", async () => {
  let persistenceCalled = false;
  const handler = createCommandGatewayHandler(dependencies({
    schemas: validators({
      validatePreparedEvent: () => [{ path: "/event_id", message: "invalid" }],
    }),
    database: database({
      processCommand: async () => {
        persistenceCalled = true;
        return result();
      },
    }),
  }));
  const response = await handler(post(command()));
  assertEquals(response.status, 500);
  assertEquals(persistenceCalled, false);
  const body = await json(response);
  assertEquals(
    (body.error as Record<string, unknown>).code,
    "runtime_contract_invalid",
  );
});
