import { assertEquals } from "jsr:@std/assert@1.0.19";

import type { DayBoundaryDatabase } from "../../../_shared/command-gateway/day-boundary-database.ts";
import { createDayBoundaryExecutor } from "../../../_shared/command-gateway/day-boundary.ts";
import { StaticRuntimeRegistry } from "../../../_shared/command-gateway/runtime-registry.ts";
import { createSchemaValidator } from "../../../_shared/command-gateway/schema-validation.ts";
import type {
  JsonValue,
  ProcessCommandResult,
} from "../../../_shared/command-gateway/types.ts";
import {
  BOUNDARY_RELEASE,
  boundaryCommand,
  boundaryRuntime,
  systemContext,
} from "./day1-boundary-fixture.ts";

function result(): ProcessCommandResult {
  return {
    outcome: "accepted",
    replayed: false,
    persisted: true,
    receipt: {
      command_id: "cmd_day_boundary_day1_boundary_test_20260723",
      expedition_id: "55000000-0000-0000-0000-0000000000d3",
      expedition_key: "day1_boundary_test",
      command_type: "process_day_boundary",
      actor_auth_user_id: null,
      actor_profile_id: null,
      actor_membership_id: null,
      actor_participant_id: null,
      actor_role: "system_clock",
      request_hash: "d".repeat(64),
      status: "accepted",
      received_at: "2026-07-23T04:30:00Z",
      processed_at: "2026-07-23T04:30:00Z",
      event_ids: ["evt_day_boundary_01", "evt_day_boundary_02", "evt_day_boundary_03"],
      stream_position: 5,
      projection_version: 2,
      runtime_release_id: BOUNDARY_RELEASE.id,
      reducer_version: BOUNDARY_RELEASE.reducer_version,
      rejection_code: null,
      rejection_message: null,
      conflict_code: null,
    },
    projection_updates: [],
    expected_stream_position: 2,
    current_stream_position: 5,
  };
}

class FakeDatabase implements DayBoundaryDatabase {
  calls: Array<Record<string, JsonValue>> = [];
  error: Error | null = null;

  async loadSystemContext() {
    return systemContext();
  }

  async processDayBoundary(request: Record<string, JsonValue>) {
    this.calls.push(request);
    if (this.error) throw this.error;
    return result();
  }
}

Deno.test("Day boundary executor prepares one null-actor atomic request", async () => {
  const database = new FakeDatabase();
  const executor = createDayBoundaryExecutor({
    database,
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([boundaryRuntime]),
    now: () => new Date("2026-07-23T04:30:00Z"),
  });
  const outcome = await executor.execute({
    command: boundaryCommand(),
    request_hash: "d".repeat(64),
  });
  assertEquals(outcome.ok, true);
  assertEquals(database.calls.length, 1);
  const request = database.calls[0];
  const transition = request.boundary_transition as Record<string, JsonValue>;
  assertEquals(transition.day_number, 1);
  assertEquals(transition.stage_id, "onboarding");
  const process = request.process_command_request as Record<string, JsonValue>;
  const actor = process.actor_context as Record<string, JsonValue>;
  assertEquals(actor, {
    auth_user_id: null,
    profile_id: null,
    membership_id: null,
    participant_id: null,
    actor_id: "system_clock",
    actor_role: "system_clock",
  });
});

Deno.test("Day boundary executor requires system_clock actor", async () => {
  const database = new FakeDatabase();
  const executor = createDayBoundaryExecutor({
    database,
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([boundaryRuntime]),
    now: () => new Date("2026-07-23T04:30:00Z"),
  });
  const outcome = await executor.execute({
    command: boundaryCommand({ actor_role: "captain" }),
    request_hash: "d".repeat(64),
  });
  assertEquals(outcome.ok, false);
  if (!outcome.ok) assertEquals(outcome.code, "system_actor_not_allowed");
  assertEquals(database.calls.length, 0);
});

Deno.test("Day boundary executor requires exact pinned boundary runtime", async () => {
  const database = new FakeDatabase();
  const executor = createDayBoundaryExecutor({
    database,
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([]),
    now: () => new Date("2026-07-23T04:30:00Z"),
  });
  const outcome = await executor.execute({
    command: boundaryCommand(),
    request_hash: "d".repeat(64),
  });
  assertEquals(outcome.ok, false);
  if (!outcome.ok) {
    assertEquals(outcome.code, "runtime_release_unavailable");
    assertEquals(outcome.retryable, true);
  }
});

Deno.test("Day boundary executor preserves stable wrapper failures", async () => {
  const database = new FakeDatabase();
  database.error = new Error("boundary_already_processed");
  const executor = createDayBoundaryExecutor({
    database,
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([boundaryRuntime]),
    now: () => new Date("2026-07-23T04:30:00Z"),
  });
  const outcome = await executor.execute({
    command: boundaryCommand(),
    request_hash: "d".repeat(64),
  });
  assertEquals(outcome.ok, false);
  if (!outcome.ok) assertEquals(outcome.code, "boundary_already_processed");
});
