import {
  assertEquals,
  assertExists,
} from "jsr:@std/assert@1.0.19";

import todayFixture from "../../../../../frontend/src/dev/today-view.day1.fixture.json" with {
  type: "json",
};
import captainFixture from "../../../../../frontend/src/dev/captain-day-view.day1.fixture.json" with {
  type: "json",
};

import {
  CAPTAIN_DAY_VIEW_SCHEMA_ID,
  createDay1CompleteTaskRuntime,
  READ_MODEL_SCHEMA_VERSION,
  TODAY_VIEW_SCHEMA_ID,
} from "../../../_shared/engine-runtime/day1-complete-task-v1.ts";
import { createSchemaValidator } from "../../../_shared/command-gateway/schema-validation.ts";
import type {
  ActorRole,
  CommandEnvelope,
  GatewayExecutionContext,
  JsonValue,
  RuntimeInput,
} from "../../../_shared/command-gateway/types.ts";

const schemas = createSchemaValidator();
const runtime = createDay1CompleteTaskRuntime({
  release_key: "day1_complete_task_test",
  git_commit_sha: "0123456789012345678901234567890123456789",
  rules_release: "engine_v8_permissions_v7_onboarding_v3",
  content_release: "day1_content_v1",
  reducer_version: "day1_complete_task_v1",
});

function clone<T>(value: T): T {
  return structuredClone(value);
}

function context(overrides: Partial<GatewayExecutionContext> = {}): GatewayExecutionContext {
  const today = clone(todayFixture) as unknown as Record<string, JsonValue>;
  const captain = clone(captainFixture) as unknown as Record<string, JsonValue>;
  return {
    expedition_id: "50000000-0000-0000-0000-000000000001",
    expedition_key: "ilka_demo_2026_01",
    expedition_status: "active",
    stream_position: 0,
    projection_version: 1,
    runtime_release: {
      id: "60000000-0000-0000-0000-000000000001",
      release_key: runtime.release_key,
      git_commit_sha: runtime.git_commit_sha,
      rules_release: runtime.rules_release,
      content_release: runtime.content_release,
      reducer_version: runtime.reducer_version,
    },
    actor: {
      auth_user_id: "10000000-0000-0000-0000-000000000001",
      profile_id: "20000000-0000-0000-0000-000000000001",
      membership_id: "30000000-0000-0000-0000-000000000001",
      participant_id: "40000000-0000-0000-0000-000000000001",
      participant_key: "participant_01",
      membership_role: "participant",
    },
    projections: [
      {
        projection_key: "today_view:participant_01",
        projection_type: "today_view",
        subject_id: "participant_01",
        schema_id: TODAY_VIEW_SCHEMA_ID,
        schema_version: READ_MODEL_SCHEMA_VERSION,
        projection: today,
        projection_version: 1,
        source_stream_position: 0,
      },
      {
        projection_key: "captain_day_view",
        projection_type: "captain_day_view",
        subject_id: null,
        schema_id: CAPTAIN_DAY_VIEW_SCHEMA_ID,
        schema_version: READ_MODEL_SCHEMA_VERSION,
        projection: captain,
        projection_version: 1,
        source_stream_position: 0,
      },
    ],
    ...overrides,
  };
}

function command(overrides: Partial<CommandEnvelope> = {}): CommandEnvelope {
  return {
    command_id: "cmd_day1_complete_task_01",
    command_type: "complete_task",
    issued_at: "2026-07-18T18:00:00+03:00",
    actor_id: "participant_01",
    actor_role: "participant",
    expedition_id: "ilka_demo_2026_01",
    idempotency_key: "cmd_day1_complete_task_01",
    day_number: 1,
    stage_id: "onboarding",
    device_id: "device_01",
    payload: { task_id: "task_team_agreement" },
    ...overrides,
  };
}

function input(
  commandOverrides: Partial<CommandEnvelope> = {},
  contextOverrides: Partial<GatewayExecutionContext> = {},
  actorRole: ActorRole = "participant",
): RuntimeInput {
  return {
    command: command(commandOverrides),
    actor_id: commandOverrides.actor_id ?? "participant_01",
    actor_role: actorRole,
    context: context(contextOverrides),
    received_at: "2026-07-18T18:00:05+03:00",
  };
}

Deno.test("Day 1 runtime confirms Product Captain from TodayView assignment", async () => {
  const resolved = await runtime.resolveActorRole(input(
    { actor_role: "product_captain" },
    {},
    "product_captain",
  ));
  assertEquals(resolved, "product_captain");
});

Deno.test("Day 1 runtime accepts an assigned on-time task completion", async () => {
  const prepared = await runtime.reduce(input());
  assertEquals(prepared.status, "accepted");
  assertEquals(prepared.events.length, 1);
  assertEquals(prepared.events[0].event_type, "task.completed");
  assertEquals(prepared.events[0].occurred_at, "2026-07-18T18:00:00+03:00");
  assertEquals(prepared.events[0].recorded_at, "2026-07-18T18:00:05+03:00");
  assertEquals(schemas.validatePreparedEvent(prepared.events[0]), []);
  assertEquals(prepared.projection_mutations.length, 2);

  const today = prepared.projection_mutations[0];
  const captain = prepared.projection_mutations[1];
  assertEquals(today.projection_key, "today_view:participant_01");
  assertEquals(captain.projection_key, "captain_day_view");
  assertEquals(schemas.validateProjection(today.schema_id, today.projection), []);
  assertEquals(schemas.validateProjection(captain.schema_id, captain.projection), []);

  const tasks = today.projection.tasks as Array<Record<string, JsonValue>>;
  assertEquals(tasks[0].status, "completed");
  const participants = captain.projection.participants as Array<Record<string, JsonValue>>;
  assertEquals(participants[0].required_tasks_terminal, true);
  const blockers = captain.projection.blockers as Array<Record<string, JsonValue>>;
  assertEquals(blockers.some((blocker) => blocker.code === "required_task_incomplete"), false);
  assertEquals((captain.projection.day as Record<string, JsonValue>).revision, 2);
  assertEquals(
    (captain.projection.completion_readiness as Record<string, JsonValue>)
      .expected_projection_version,
    2,
  );
});

Deno.test("Day 1 runtime emits task.completed_late after the due day", async () => {
  const lateContext = context();
  const today = lateContext.projections[0].projection;
  (today.day as Record<string, JsonValue>).number = 2;
  const captain = lateContext.projections[1].projection;
  (captain.day as Record<string, JsonValue>).number = 2;

  const prepared = await runtime.reduce(input(
    { day_number: 2 },
    lateContext,
  ));
  assertEquals(prepared.status, "accepted");
  assertEquals(prepared.events[0].event_type, "task.completed_late");
  assertEquals(
    (prepared.events[0].payload as Record<string, JsonValue>).due_day_number,
    1,
  );
  assertEquals(
    (prepared.events[0].payload as Record<string, JsonValue>).completed_on_day_number,
    2,
  );
  assertEquals(schemas.validatePreparedEvent(prepared.events[0]), []);
});

Deno.test("Day 1 runtime persists a deterministic rejection for a terminal task", async () => {
  const terminal = context();
  const tasks = terminal.projections[0].projection.tasks as Array<Record<string, JsonValue>>;
  tasks[0].status = "completed";
  const prepared = await runtime.reduce(input({}, terminal));
  assertEquals(prepared.status, "rejected");
  assertEquals(prepared.rejection?.code, "task_already_terminal");
  assertEquals(prepared.events, []);
  assertEquals(prepared.projection_mutations, []);
});

Deno.test("Day 1 runtime rejects a task outside the actor TodayView", async () => {
  const prepared = await runtime.reduce(input({
    payload: { task_id: "task_not_assigned" },
  }));
  assertEquals(prepared.status, "rejected");
  assertEquals(prepared.rejection?.code, "actor_cannot_complete_assignment");
});

Deno.test("Day 1 runtime rejects an ambiguous Captain task target", async () => {
  const captainContext = context({
    actor: {
      auth_user_id: "10000000-0000-0000-0000-000000000009",
      profile_id: "20000000-0000-0000-0000-000000000009",
      membership_id: "30000000-0000-0000-0000-000000000009",
      participant_id: null,
      participant_key: null,
      membership_role: "captain",
    },
  });
  const prepared = await runtime.reduce(input(
    {
      actor_id: "member_30000000000000000000000000000009",
      actor_role: "captain",
    },
    captainContext,
    "captain",
  ));
  assertEquals(prepared.status, "rejected");
  assertEquals(prepared.rejection?.code, "task_target_ambiguous_for_captain");
});

Deno.test("Day 1 runtime rejects missing authoritative projections", async () => {
  const missing = context({ projections: [] });
  const prepared = await runtime.reduce(input({}, missing));
  assertEquals(prepared.status, "rejected");
  assertEquals(prepared.rejection?.code, "participant_projection_missing");
});

Deno.test("Day 1 runtime rejects commands outside the registered slice", async () => {
  const prepared = await runtime.reduce(input({
    command_type: "acknowledge_card",
    payload: { card_id: "knowledge_expedition_rules" },
  }));
  assertEquals(prepared.status, "rejected");
  assertExists(prepared.rejection);
  assertEquals(prepared.rejection.code, "command_not_implemented_in_runtime");
});
