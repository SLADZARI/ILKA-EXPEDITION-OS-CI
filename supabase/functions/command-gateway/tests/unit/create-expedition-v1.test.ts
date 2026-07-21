import {
  assertEquals,
  assertThrows,
} from "jsr:@std/assert@1.0.19";

import { createExpeditionBootstrapCapability } from "../../../_shared/engine-runtime/create-expedition-v1.ts";
import type {
  BootstrapRuntimeInput,
  PreparedCommandResult,
} from "../../../_shared/command-gateway/types.ts";

const AUTH_USER_ID = "81000000-0000-4000-8000-000000000001";
const PROFILE_ID = "82000000-0000-4000-8000-000000000001";
const MEMBERSHIP_ID = "83000000-0000-4000-8000-000000000001";
const ACTOR_ID = "member_83000000000040008000000000000001";

const capability = createExpeditionBootstrapCapability({
  duration_days: 12,
  recovery_days_available: 1,
});

function input(): BootstrapRuntimeInput {
  return {
    command: {
      command_id: "cmd_create_expedition_01",
      command_type: "create_expedition",
      issued_at: "2026-07-21T10:00:00.000Z",
      actor_id: ACTOR_ID,
      actor_role: "captain",
      expedition_id: "ilka_expedition_01",
      idempotency_key: "cmd_create_expedition_01",
      day_number: null,
      stage_id: null,
      device_id: "device_captain_01",
      day_revision: null,
      payload: {
        name: "ILKA Expedition 01",
        timezone: "Europe/Warsaw",
        duration_days: 12,
        day_boundary_local_time: "06:00",
      },
    },
    actor_role: "captain",
    actor_id: ACTOR_ID,
    actor: {
      auth_user_id: AUTH_USER_ID,
      profile_id: PROFILE_ID,
      membership_id: MEMBERSHIP_ID,
      profile_status: "active",
    },
    runtime_release: {
      id: "84000000-0000-4000-8000-000000000001",
      release_key: "bootstrap_reducer_test",
      git_commit_sha: "0000000000000000000000000000000000000084",
      rules_release: "rules-bootstrap-test",
      content_release: "content-bootstrap-test",
      reducer_version: "create-expedition-v1",
    },
    received_at: "2026-07-21T10:00:01.000Z",
  };
}

function expectRejected(
  result: PreparedCommandResult,
  code: string,
): void {
  assertEquals(result.status, "rejected");
  assertEquals(result.events, []);
  assertEquals(result.projection_mutations, []);
  assertEquals(result.rejection?.code, code);
}

Deno.test("create_expedition reducer emits one canonical creation event", async () => {
  const result = await capability.reduceCreateExpedition(input());

  assertEquals(result.status, "accepted");
  assertEquals(result.rejection, null);
  assertEquals(result.projection_mutations, []);
  assertEquals(result.events, [{
    event_id: "evt_create_expedition_01_01",
    event_type: "expedition.created",
    occurred_at: "2026-07-21T10:00:00.000Z",
    recorded_at: "2026-07-21T10:00:01.000Z",
    actor_id: ACTOR_ID,
    actor_role: "captain",
    expedition_id: "ilka_expedition_01",
    day_number: null,
    stage_id: null,
    command_id: "cmd_create_expedition_01",
    idempotency_key: "cmd_create_expedition_01",
    device_id: "device_captain_01",
    sync_status: "synced",
    schema_version: 1,
    payload: {
      name: "ILKA Expedition 01",
      timezone: "Europe/Warsaw",
      duration_days: 12,
      day_boundary_local_time: "06:00",
    },
    day_revision: null,
  }]);
});

Deno.test("bootstrap capability preserves release-owned program policy", () => {
  assertEquals(capability.program, {
    duration_days: 12,
    recovery_days_available: 1,
  });
});

Deno.test("bootstrap capability rejects an invalid program policy", () => {
  assertThrows(
    () => createExpeditionBootstrapCapability({
      duration_days: 0,
      recovery_days_available: 1,
    }),
    TypeError,
    "invalid_bootstrap_program_policy",
  );
});

Deno.test("create_expedition reducer rejects unsupported commands", async () => {
  const value = input();
  value.command.command_type = "complete_task";
  expectRejected(
    await capability.reduceCreateExpedition(value),
    "command_not_implemented_in_bootstrap_runtime",
  );
});

Deno.test("create_expedition reducer requires an active Profile", async () => {
  const value = input();
  value.actor.profile_status = "disabled";
  expectRejected(
    await capability.reduceCreateExpedition(value),
    "active_profile_required",
  );
});

Deno.test("create_expedition reducer rejects a forged Captain membership actor", async () => {
  const value = input();
  value.command.actor_id = "member_forged";
  expectRejected(
    await capability.reduceCreateExpedition(value),
    "profile_actor_mismatch",
  );
});

Deno.test("create_expedition reducer requires a canonical Expedition key", async () => {
  const value = input();
  value.command.expedition_id = "ILKA Expedition";
  expectRejected(
    await capability.reduceCreateExpedition(value),
    "validation_failed",
  );
});

Deno.test("create_expedition reducer enforces command_id idempotency", async () => {
  const value = input();
  value.command.idempotency_key = "another_key";
  expectRejected(
    await capability.reduceCreateExpedition(value),
    "validation_failed",
  );
});

Deno.test("create_expedition reducer forbids Day and Stage context", async () => {
  const value = input();
  value.command.day_number = 1;
  value.command.stage_id = "onboarding";
  value.command.day_revision = 1;
  expectRejected(
    await capability.reduceCreateExpedition(value),
    "validation_failed",
  );
});

Deno.test("create_expedition reducer rejects a non-trimmed name", async () => {
  const value = input();
  value.command.payload.name = " ILKA Expedition 01 ";
  expectRejected(
    await capability.reduceCreateExpedition(value),
    "validation_failed",
  );
});

Deno.test("create_expedition reducer validates the IANA timezone", async () => {
  const value = input();
  value.command.payload.timezone = "Mars/Olympus";
  expectRejected(
    await capability.reduceCreateExpedition(value),
    "invalid_timezone",
  );
});

Deno.test("create_expedition reducer enforces the pinned program duration", async () => {
  const value = input();
  value.command.payload.duration_days = 10;
  expectRejected(
    await capability.reduceCreateExpedition(value),
    "validation_failed",
  );
});

Deno.test("create_expedition reducer validates the local Day boundary", async () => {
  const value = input();
  value.command.payload.day_boundary_local_time = "25:00";
  expectRejected(
    await capability.reduceCreateExpedition(value),
    "validation_failed",
  );
});
