import { assertEquals } from "jsr:@std/assert@1.0.19";

import captainFixture from "../../../../../frontend/src/dev/captain-day-view.day1.fixture.json" with {
  type: "json",
};
import todayFixture from "../../../../../frontend/src/dev/today-view.day1.fixture.json" with {
  type: "json",
};
import {
  CAPTAIN_DAY_VIEW_SCHEMA_ID,
  READ_MODEL_SCHEMA_VERSION,
  TODAY_VIEW_SCHEMA_ID,
} from "../../../_shared/engine-runtime/day1-complete-task-v1.ts";
import {
  createDay1PilotRuntime,
  isDay1PilotRuntime,
} from "../../../_shared/engine-runtime/day1-pilot-v1.ts";
import { isDay1BoundaryRuntime } from "../../../_shared/engine-runtime/day1-boundary-v1.ts";
import { isExpeditionBootstrapRuntime } from "../../../_shared/engine-runtime/expedition-bootstrap-v1.ts";
import { isExpeditionInvitationRuntime } from "../../../_shared/engine-runtime/expedition-invitations-v1.ts";
import { isExpeditionRotationRuntime } from "../../../_shared/engine-runtime/expedition-rotation-v1.ts";
import { isExpeditionStartRuntime } from "../../../_shared/engine-runtime/expedition-start-v1.ts";
import type {
  ActorContext,
  CommandEnvelope,
  GatewayExecutionContext,
  JsonValue,
  RuntimeInput,
} from "../../../_shared/command-gateway/types.ts";
import {
  BOUNDARY_RELEASE,
  boundaryCommand,
  systemContext,
} from "./day1-boundary-fixture.ts";

const runtime = createDay1PilotRuntime(BOUNDARY_RELEASE);
const CAPTAIN_MEMBERSHIP_ID = "30000000-0000-0000-0000-0000000000e1";
const CAPTAIN_ACTOR_ID = `member_${CAPTAIN_MEMBERSHIP_ID.replaceAll("-", "")}`;

function captain(): ActorContext {
  return {
    auth_user_id: "10000000-0000-0000-0000-0000000000e1",
    profile_id: "20000000-0000-0000-0000-0000000000e1",
    membership_id: CAPTAIN_MEMBERSHIP_ID,
    participant_id: null,
    participant_key: null,
    membership_role: "captain",
  };
}

function context(
  status: string,
  overrides: Partial<GatewayExecutionContext> = {},
): GatewayExecutionContext {
  return {
    expedition_id: "50000000-0000-0000-0000-0000000000e1",
    expedition_key: "day1_pilot_test",
    expedition_status: status,
    stream_position: 0,
    projection_version: 0,
    runtime_release: {
      id: "60000000-0000-0000-0000-0000000000e1",
      release_key: runtime.release_key,
      git_commit_sha: runtime.git_commit_sha,
      rules_release: runtime.rules_release,
      content_release: runtime.content_release,
      reducer_version: runtime.reducer_version,
    },
    actor: captain(),
    projections: [],
    ...overrides,
  };
}

function command(
  commandType: CommandEnvelope["command_type"],
  overrides: Partial<CommandEnvelope> = {},
): CommandEnvelope {
  return {
    command_id: `cmd_day1_pilot_${commandType}`,
    command_type: commandType,
    issued_at: "2026-07-24T06:00:00+02:00",
    actor_id: CAPTAIN_ACTOR_ID,
    actor_role: "captain",
    expedition_id: "day1_pilot_test",
    idempotency_key: `cmd_day1_pilot_${commandType}`,
    day_number: null,
    stage_id: null,
    device_id: null,
    day_revision: null,
    payload: {},
    ...overrides,
  };
}

function input(
  commandValue: CommandEnvelope,
  contextValue: GatewayExecutionContext,
): RuntimeInput {
  return {
    command: commandValue,
    actor_id: commandValue.actor_id,
    actor_role: commandValue.actor_role,
    context: contextValue,
    received_at: "2026-07-24T04:00:05Z",
  };
}

Deno.test("Day 1 pilot runtime exposes every accepted capability from one bundle", () => {
  assertEquals(isDay1PilotRuntime(runtime), true);
  assertEquals(isExpeditionBootstrapRuntime(runtime), true);
  assertEquals(isExpeditionInvitationRuntime(runtime), true);
  assertEquals(isExpeditionRotationRuntime(runtime), true);
  assertEquals(isExpeditionStartRuntime(runtime), true);
  assertEquals(isDay1BoundaryRuntime(runtime), true);
  assertEquals(runtime.bootstrap_policy, {
    duration_days: 12,
    recovery_days_available: 1,
  });
  assertEquals(runtime.invitation_policy, {
    team_size_min: 3,
    team_size_max: 5,
    invitation_ttl_hours: 168,
  });
  assertEquals(runtime.rotation_policy.rotation_rules_version, 2);
  assertEquals(runtime.start_policy.first_stage_id, "onboarding");
  assertEquals(runtime.day1_policy.stage_id, "onboarding");
});

Deno.test("Day 1 pilot runtime dispatches setup commands to protected reducers", async () => {
  const bootstrap = await runtime.reduce(input(
    command("create_expedition", {
      payload: {
        name: "Day 1 Pilot Test",
        timezone: "Europe/Warsaw",
        duration_days: 12,
        day_boundary_local_time: "06:00",
      },
    }),
    context("absent"),
  ));
  assertEquals(bootstrap.status, "accepted");
  assertEquals(bootstrap.events.map((event) => event.event_type), [
    "expedition.created",
  ]);

  const invitation = await runtime.reduce(input(
    command("invite_participant", { payload: { email: "p1@example.test" } }),
    context("draft"),
  ));
  assertEquals(invitation.status, "rejected");
  assertEquals(invitation.rejection?.code, "runtime_contract_invalid");

  const rotation = await runtime.reduce(input(
    command("generate_rotation"),
    context("draft"),
  ));
  assertEquals(rotation.status, "rejected");
  assertEquals(rotation.rejection?.code, "expedition_setup_projection_missing");

  const start = await runtime.reduce(input(
    command("start_expedition"),
    context("ready"),
  ));
  assertEquals(start.status, "rejected");
  assertEquals(start.rejection?.code, "expedition_setup_projection_missing");

  const task = await runtime.reduce(input(
    command("complete_task", {
      actor_id: "participant_01",
      actor_role: "participant",
      day_number: 1,
      stage_id: "onboarding",
      payload: { task_id: "task_team_agreement" },
    }),
    context("draft", {
      actor: {
        auth_user_id: "10000000-0000-0000-0000-0000000000e2",
        profile_id: "20000000-0000-0000-0000-0000000000e2",
        membership_id: "30000000-0000-0000-0000-0000000000e2",
        participant_id: "40000000-0000-0000-0000-0000000000e2",
        participant_key: "participant_01",
        membership_role: "participant",
      },
    }),
  ));
  assertEquals(task.status, "rejected");
  assertEquals(task.rejection?.code, "expedition_not_active");
});

Deno.test("Day 1 pilot runtime preserves trusted boundary isolation", async () => {
  const publicAttempt = await runtime.reduce(input(
    boundaryCommand({
      expedition_id: "day1_pilot_test",
      actor_id: "system_clock",
      actor_role: "system_clock",
    }),
    context("active", { actor: null }),
  ));
  assertEquals(publicAttempt.status, "rejected");
  assertEquals(
    publicAttempt.rejection?.code,
    "command_not_implemented_in_runtime",
  );

  const trusted = await runtime.reduceBoundary({
    command: boundaryCommand(),
    actor_id: "system_clock",
    actor_role: "system_clock",
    context: systemContext(),
    received_at: "2026-07-23T04:31:00Z",
  });
  assertEquals(trusted.status, "accepted");
  assertEquals(trusted.events.map((event) => event.event_type), [
    "day.started",
    "role_assignments.activated",
    "card_bundles.published",
  ]);
});

Deno.test("Day 1 pilot runtime delegates Product Captain role resolution", async () => {
  const projections = [
    {
      projection_key: "today_view:participant_01",
      projection_type: "today_view",
      subject_id: "participant_01",
      schema_id: TODAY_VIEW_SCHEMA_ID,
      schema_version: READ_MODEL_SCHEMA_VERSION,
      projection: structuredClone(todayFixture) as unknown as Record<string, JsonValue>,
      projection_version: 1,
      source_stream_position: 5,
    },
    {
      projection_key: "captain_day_view",
      projection_type: "captain_day_view",
      subject_id: null,
      schema_id: CAPTAIN_DAY_VIEW_SCHEMA_ID,
      schema_version: READ_MODEL_SCHEMA_VERSION,
      projection: structuredClone(captainFixture) as unknown as Record<
        string,
        JsonValue
      >,
      projection_version: 1,
      source_stream_position: 5,
    },
  ];
  const role = await runtime.resolveActorRole(input(
    command("complete_task", {
      actor_id: "participant_01",
      actor_role: "product_captain",
      day_number: 1,
      stage_id: "onboarding",
      payload: { task_id: "task_team_agreement" },
    }),
    context("active", {
      expedition_key: "ilka_demo_2026_01",
      actor: {
        auth_user_id: "10000000-0000-0000-0000-0000000000e2",
        profile_id: "20000000-0000-0000-0000-0000000000e2",
        membership_id: "30000000-0000-0000-0000-0000000000e2",
        participant_id: "40000000-0000-0000-0000-0000000000e2",
        participant_key: "participant_01",
        membership_role: "participant",
      },
      projections,
    }),
  ));
  assertEquals(role, "product_captain");
});
