import { assertEquals } from "jsr:@std/assert@1.0.19";

import { commandRequestHash } from "../../../_shared/command-gateway/canonical-json.ts";
import type { DayBoundaryExecutor } from "../../../_shared/command-gateway/day-boundary.ts";
import { createCommandGatewayHandler } from "../../../_shared/command-gateway/handler.ts";
import { StaticRuntimeRegistry } from "../../../_shared/command-gateway/runtime-registry.ts";
import type { SystemClockRequestVerifier } from "../../../_shared/command-gateway/system-clock-auth.ts";
import type {
  ExistingReceiptLookup,
  GatewayDatabase,
  GatewayDependencies,
  ProcessCommandResult,
  SchemaValidator,
} from "../../../_shared/command-gateway/types.ts";
import { boundaryCommand } from "./day1-boundary-fixture.ts";

const REQUEST_ID = "77000000-0000-0000-0000-0000000000d3";

function validators(): SchemaValidator {
  return {
    validateCommand: () => [],
    validatePreparedEvent: () => [],
    validateProjection: () => [],
    validateProcessRequest: () => [],
    validateProcessResult: () => [],
  };
}

function accepted(replayed = false): ProcessCommandResult {
  const command = boundaryCommand();
  return {
    outcome: "accepted",
    replayed,
    persisted: true,
    receipt: {
      command_id: command.command_id,
      expedition_id: "55000000-0000-0000-0000-0000000000d3",
      expedition_key: command.expedition_id,
      command_type: command.command_type,
      actor_auth_user_id: null,
      actor_profile_id: null,
      actor_membership_id: null,
      actor_participant_id: null,
      actor_role: "system_clock",
      request_hash: "d".repeat(64),
      status: "accepted",
      received_at: "2026-07-23T04:30:00Z",
      processed_at: "2026-07-23T04:30:00Z",
      event_ids: ["evt_boundary_01", "evt_boundary_02", "evt_boundary_03"],
      stream_position: 5,
      projection_version: 2,
      runtime_release_id: "66000000-0000-0000-0000-0000000000d3",
      reducer_version: "day1_boundary_test_v1",
      rejection_code: null,
      rejection_message: null,
      conflict_code: null,
    },
    projection_updates: [],
    expected_stream_position: 2,
    current_stream_position: 5,
  };
}

function database(existing: ExistingReceiptLookup | null = null): GatewayDatabase {
  return {
    getReceipt: async () => existing,
    loadContext: async () => {
      throw new Error("trusted system branch must not load human context");
    },
    processCommand: async () => {
      throw new Error("trusted system branch must not call generic processCommand");
    },
  };
}

function dependencies(
  existing: ExistingReceiptLookup | null = null,
): GatewayDependencies {
  return {
    auth: {
      verify: async () => {
        throw new Error("trusted system branch must not call human auth verifier");
      },
    },
    database: database(existing),
    schemas: validators(),
    runtimes: new StaticRuntimeRegistry([]),
    allowedOrigins: new Set(["http://localhost:5173"]),
    now: () => new Date("2026-07-23T04:30:00Z"),
    requestId: () => REQUEST_ID,
  };
}

function verifier(ok: boolean): SystemClockRequestVerifier {
  return {
    verify: async () =>
      ok ? { ok: true } : {
        ok: false,
        status: 401,
        code: "system_clock_signature_invalid",
        message: "The trusted system clock signature is invalid.",
        retryable: false,
      },
  };
}

function request(body = JSON.stringify(boundaryCommand()), complete = true): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: "Bearer platform-jwt",
  };
  headers["x-ilka-system-timestamp"] = "1784781000";
  if (complete) headers["x-ilka-system-signature"] = "a".repeat(64);
  return new Request("http://localhost/functions/v1/command-gateway", {
    method: "POST",
    headers,
    body,
  });
}

Deno.test("gateway routes verified system_clock request before human authentication", async () => {
  let calls = 0;
  const executor: DayBoundaryExecutor = {
    execute: async () => {
      calls += 1;
      return { ok: true, result: accepted() };
    },
  };
  const handler = createCommandGatewayHandler(
    dependencies(),
    undefined,
    undefined,
    undefined,
    undefined,
    { verifier: verifier(true), executor },
  );
  const response = await handler(request());
  assertEquals(response.status, 200);
  assertEquals(calls, 1);
});

Deno.test("gateway rejects partial system headers before any receipt lookup", async () => {
  const handler = createCommandGatewayHandler(
    dependencies(),
    undefined,
    undefined,
    undefined,
    undefined,
    {
      verifier: verifier(true),
      executor: { execute: async () => ({ ok: true, result: accepted() }) },
    },
  );
  const response = await handler(request(undefined, false));
  assertEquals(response.status, 401);
  const payload = await response.json();
  assertEquals(payload.error.code, "system_clock_authentication_required");
});

Deno.test("gateway verifies signature before parsing or returning receipt data", async () => {
  const handler = createCommandGatewayHandler(
    dependencies(),
    undefined,
    undefined,
    undefined,
    undefined,
    {
      verifier: verifier(false),
      executor: { execute: async () => ({ ok: true, result: accepted() }) },
    },
  );
  const response = await handler(request("not-json"));
  assertEquals(response.status, 401);
  const payload = await response.json();
  assertEquals(payload.error.code, "system_clock_signature_invalid");
});

Deno.test("gateway returns exact system replay before executor", async () => {
  const command = boundaryCommand();
  const hash = await commandRequestHash(command);
  const replay = accepted(true);
  replay.receipt.request_hash = hash;
  const existing: ExistingReceiptLookup = {
    expedition_key: command.expedition_id,
    request_hash: hash,
    result: replay,
  };
  let calls = 0;
  const handler = createCommandGatewayHandler(
    dependencies(existing),
    undefined,
    undefined,
    undefined,
    undefined,
    {
      verifier: verifier(true),
      executor: {
        execute: async () => {
          calls += 1;
          return { ok: true, result: accepted() };
        },
      },
    },
  );
  const response = await handler(request());
  assertEquals(response.status, 200);
  assertEquals(calls, 0);
  const payload = await response.json();
  assertEquals(payload.data.replayed, true);
});
