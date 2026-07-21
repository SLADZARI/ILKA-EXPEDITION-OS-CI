import { assertEquals } from "jsr:@std/assert@1.0.19";

import { createCommandGatewayHandler } from "../../../_shared/command-gateway/handler.ts";
import type { InvitationExecutor } from "../../../_shared/command-gateway/invitation.ts";
import { StaticRuntimeRegistry } from "../../../_shared/command-gateway/runtime-registry.ts";
import type {
  CommandEnvelope,
  GatewayDatabase,
  GatewayDependencies,
  ProcessCommandResult,
  SchemaValidator,
} from "../../../_shared/command-gateway/types.ts";

const AUTH_USER_ID = "10000000-0000-0000-0000-000000000097";
const REQUEST_ID = "70000000-0000-0000-0000-000000000097";

function command(
  type: "invite_participant" | "accept_invitation" | "revoke_invitation",
): CommandEnvelope {
  return {
    command_id: `cmd_handler_${type}`,
    command_type: type,
    issued_at: "2026-07-21T20:00:00Z",
    actor_id: type === "accept_invitation"
      ? "20000000-0000-0000-0000-000000000097"
      : "member_30000000000000000000000000000097",
    actor_role: type === "accept_invitation" ? "participant" : "captain",
    expedition_id: "invitation_handler_test",
    idempotency_key: `cmd_handler_${type}`,
    day_number: null,
    stage_id: null,
    day_revision: null,
    payload: type === "invite_participant"
      ? { email: "a@example.test", invitation_token: "A".repeat(43) }
      : type === "accept_invitation"
      ? { invitation_token: "A".repeat(43), display_name: "A" }
      : {
        invitation_id: "invitation_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        reason: "Unavailable",
      },
  };
}

function result(current: CommandEnvelope): ProcessCommandResult {
  return {
    outcome: "accepted",
    replayed: false,
    persisted: true,
    receipt: {
      command_id: current.command_id,
      expedition_id: "50000000-0000-0000-0000-000000000097",
      expedition_key: current.expedition_id,
      command_type: current.command_type,
      actor_auth_user_id: AUTH_USER_ID,
      actor_profile_id: "20000000-0000-0000-0000-000000000097",
      actor_membership_id: "30000000-0000-0000-0000-000000000097",
      actor_participant_id: null,
      actor_role: current.actor_role,
      request_hash: "a".repeat(64),
      status: "accepted",
      received_at: "2026-07-21T20:00:01Z",
      processed_at: "2026-07-21T20:00:01Z",
      event_ids: ["evt_handler_invitation_01"],
      stream_position: 2,
      projection_version: 1,
      runtime_release_id: "60000000-0000-0000-0000-000000000097",
      reducer_version: "invitation_handler_test_v1",
      rejection_code: null,
      rejection_message: null,
      conflict_code: null,
    },
    projection_updates: [],
    expected_stream_position: 1,
    current_stream_position: 2,
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
      throw new Error("invitation branch must run before generic context loading");
    },
    processCommand: async () => {
      throw new Error("invitation branch must not call generic processCommand");
    },
  };
}

function dependencies(
  databaseOverride: GatewayDatabase = database(),
): GatewayDependencies {
  return {
    auth: {
      verify: async () => ({
        id: AUTH_USER_ID,
        email: "a@example.test",
        email_verified: true,
      }),
    },
    database: databaseOverride,
    schemas: validators(),
    runtimes: new StaticRuntimeRegistry([]),
    allowedOrigins: new Set(["http://localhost:5173"]),
    now: () => new Date("2026-07-21T20:00:01Z"),
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

Deno.test("gateway routes pre-membership accept_invitation to InvitationExecutor", async () => {
  const current = command("accept_invitation");
  let calls = 0;
  const executor: InvitationExecutor = {
    execute: async (request) => {
      calls += 1;
      assertEquals(request.command.command_id, current.command_id);
      assertEquals(request.auth_user.email_verified, true);
      return { ok: true, result: result(current) };
    },
  };
  const handler = createCommandGatewayHandler(
    dependencies(),
    undefined,
    executor,
  );
  const response = await handler(post(current));
  assertEquals(response.status, 200);
  assertEquals(calls, 1);
  assertEquals((await body(response)).request_id, REQUEST_ID);
});

Deno.test("gateway routes Captain invitation commands to InvitationExecutor", async () => {
  for (const type of ["invite_participant", "revoke_invitation"] as const) {
    const current = command(type);
    let calls = 0;
    const executor: InvitationExecutor = {
      execute: async () => {
        calls += 1;
        return { ok: true, result: result(current) };
      },
    };
    const handler = createCommandGatewayHandler(
      dependencies(),
      undefined,
      executor,
    );
    const response = await handler(post(current));
    assertEquals(response.status, 200);
    assertEquals(calls, 1);
  }
});

Deno.test("gateway returns runtime_release_unavailable when invitation executor is absent", async () => {
  const handler = createCommandGatewayHandler(dependencies());
  const response = await handler(post(command("invite_participant")));
  assertEquals(response.status, 503);
  const payload = await body(response);
  assertEquals((payload.error as Record<string, unknown>).code, "runtime_release_unavailable");
});

Deno.test("gateway maps stable InvitationExecutor failures", async () => {
  const current = command("accept_invitation");
  const executor: InvitationExecutor = {
    execute: async () => ({
      ok: false,
      status: 403,
      code: "invitation_email_mismatch",
      message: "The authenticated email does not match the invitation.",
      retryable: false,
    }),
  };
  const handler = createCommandGatewayHandler(
    dependencies(),
    undefined,
    executor,
  );
  const response = await handler(post(current));
  assertEquals(response.status, 403);
  const payload = await body(response);
  assertEquals(
    (payload.error as Record<string, unknown>).code,
    "invitation_email_mismatch",
  );
});
