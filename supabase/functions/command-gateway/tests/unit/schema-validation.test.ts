import { assertEquals, assertGreater } from "jsr:@std/assert@1.0.19";

import todayFixture from "../../../../../frontend/src/dev/today-view.day1.fixture.json" with {
  type: "json",
};
import captainFixture from "../../../../../frontend/src/dev/captain-day-view.day1.fixture.json" with {
  type: "json",
};

import { createSchemaValidator } from "../../../_shared/command-gateway/schema-validation.ts";
import {
  CAPTAIN_DAY_VIEW_SCHEMA_ID,
  TODAY_VIEW_SCHEMA_ID,
} from "../../../_shared/engine-runtime/day1-complete-task-v1.ts";

const schemas = createSchemaValidator();

Deno.test("canonical command schema accepts a complete_task envelope", () => {
  assertEquals(
    schemas.validateCommand({
      command_id: "cmd_schema_01",
      command_type: "complete_task",
      issued_at: "2026-07-20T21:00:00Z",
      actor_id: "participant_01",
      actor_role: "participant",
      expedition_id: "schema_test",
      idempotency_key: "cmd_schema_01",
      payload: { task_id: "task_01" },
    }),
    [],
  );
});

Deno.test("canonical command schema rejects an incomplete payload", () => {
  assertGreater(
    schemas.validateCommand({
      command_id: "cmd_schema_02",
      command_type: "complete_task",
      issued_at: "2026-07-20T21:00:00Z",
      actor_id: "participant_01",
      actor_role: "participant",
      expedition_id: "schema_test",
      idempotency_key: "cmd_schema_02",
      payload: {},
    }).length,
    0,
  );
});

Deno.test("gateway validates canonical Participant and Captain projections", () => {
  assertEquals(schemas.validateProjection(TODAY_VIEW_SCHEMA_ID, todayFixture), []);
  assertEquals(
    schemas.validateProjection(CAPTAIN_DAY_VIEW_SCHEMA_ID, captainFixture),
    [],
  );
});

Deno.test("gateway rejects an unknown projection schema", () => {
  const issues = schemas.validateProjection("https://ilka.local/schemas/unknown.json", {});
  assertEquals(issues.length, 1);
  assertEquals(issues[0].path, "/");
});

Deno.test("gateway rejects an invalid TodayView projection", () => {
  const issues = schemas.validateProjection(TODAY_VIEW_SCHEMA_ID, {
    expedition_id: "schema_test",
  });
  assertGreater(issues.length, 0);
});

Deno.test("private persistence request schema accepts a deterministic rejection", () => {
  assertEquals(
    schemas.validateProcessRequest({
      expedition_id: "50000000-0000-0000-0000-000000000001",
      command: {
        command_id: "cmd_schema_03",
        command_type: "complete_task",
        issued_at: "2026-07-20T21:00:00Z",
        actor_id: "participant_01",
        actor_role: "participant",
        expedition_id: "schema_test",
        idempotency_key: "cmd_schema_03",
        payload: { task_id: "task_01" },
      },
      actor_context: {
        auth_user_id: "10000000-0000-0000-0000-000000000001",
        profile_id: "20000000-0000-0000-0000-000000000001",
        membership_id: "30000000-0000-0000-0000-000000000001",
        participant_id: "40000000-0000-0000-0000-000000000001",
        actor_id: "participant_01",
        actor_role: "participant",
      },
      request_hash: "a".repeat(64),
      expected_stream_position: 0,
      status: "rejected",
      events: [],
      projection_mutations: [],
      runtime_release_id: "60000000-0000-0000-0000-000000000001",
      reducer_version: "reducer-schema-test",
      received_at: "2026-07-20T21:00:00Z",
      processed_at: "2026-07-20T21:00:01Z",
      rejection: { code: "invalid_state", message: "Invalid state." },
    }),
    [],
  );
});
