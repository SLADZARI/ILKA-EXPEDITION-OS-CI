import { createDay1BoundaryRuntime } from "../../../_shared/engine-runtime/day1-boundary-v1.ts";
import type { SystemExecutionContext } from "../../../_shared/engine-runtime/day1-boundary-v1.ts";
import type {
  CommandEnvelope,
  JsonValue,
} from "../../../_shared/command-gateway/types.ts";

export const BOUNDARY_RELEASE = {
  id: "66000000-0000-0000-0000-0000000000d3",
  release_key: "day1_boundary_test",
  git_commit_sha: "00000000000000000000000000000000000000d3",
  rules_release: "engine_v10_day1_boundary_test",
  content_release: "day1_boundary_test_v1",
  reducer_version: "day1_boundary_test_v1",
};

export const PARTICIPANTS = [1, 2, 3].map((index) =>
  `participant_${index.toString(16).padStart(32, "0")}`
);

export const DAY1_POLICY = {
  ...BOUNDARY_RELEASE,
  day_number: 1 as const,
  stage_id: "onboarding" as const,
  stage_title: "Onboarding and Team Contract",
  next_stage_id: "problem_discovery",
  rotation_rules_version: 2,
  product_role_titles: {
    product_captain: "Product Captain",
    product_support: "Product Support",
  },
  onboard_role_titles: {
    navigation: "Navigation",
    mooring: "Mooring",
    order: "Order",
    cook: "Cook",
    product_focus: "Product Focus",
  },
  shared_cards: [
    {
      card_id: "knowledge_expedition_rules",
      type: "knowledge" as const,
      title: "Правила экспедиции",
      required: true,
    },
    {
      card_id: "knowledge_day_01_flow",
      type: "knowledge" as const,
      title: "Как проходит Day 1",
      required: true,
    },
    {
      card_id: "safety_captain_authority",
      type: "safety" as const,
      title: "Приоритет капитана и безопасность",
      required: true,
    },
    {
      card_id: "task_team_agreement",
      type: "task" as const,
      title: "Сформировать Team Agreement",
      required: true,
    },
  ],
  product_role_cards: {
    product_captain: [{
      card_id: "role_product_captain_day_01",
      type: "role" as const,
      title: "Product Captain — Day 1",
      required: true,
    }],
    product_support: [{
      card_id: "role_product_support_day_01",
      type: "role" as const,
      title: "Product Support — Day 1",
      required: true,
    }],
  },
  onboard_role_cards: {
    navigation: [{
      card_id: "onboard_navigation_day_01",
      type: "onboard" as const,
      title: "Navigation — Day 1",
      required: true,
    }],
    mooring: [{
      card_id: "onboard_mooring_day_01",
      type: "onboard" as const,
      title: "Mooring — Day 1",
      required: true,
    }],
    order: [{
      card_id: "onboard_order_day_01",
      type: "onboard" as const,
      title: "Order — Day 1",
      required: true,
    }],
    cook: [{
      card_id: "onboard_cook_day_01",
      type: "onboard" as const,
      title: "Cook — Day 1",
      required: true,
    }],
    product_focus: [{
      card_id: "onboard_product_focus_day_01",
      type: "onboard" as const,
      title: "Product Focus — Day 1",
      required: true,
    }],
  },
  required_outputs: [
    { output_id: "team_agreement", title: "Team Agreement", required: true },
    {
      output_id: "safety_acknowledgements",
      title: "Safety Acknowledgements",
      required: true,
    },
    {
      output_id: "participant_profiles",
      title: "Participant Profiles",
      required: true,
    },
  ],
};

export const boundaryRuntime = createDay1BoundaryRuntime(DAY1_POLICY);

export function boundaryCommand(
  overrides: Partial<CommandEnvelope> = {},
): CommandEnvelope {
  return {
    command_id: "cmd_day_boundary_day1_boundary_test_20260723",
    command_type: "process_day_boundary",
    issued_at: "2026-07-23T04:30:00Z",
    actor_id: "system_clock",
    actor_role: "system_clock",
    expedition_id: "day1_boundary_test",
    idempotency_key: "cmd_day_boundary_day1_boundary_test_20260723",
    day_number: null,
    stage_id: null,
    device_id: null,
    day_revision: null,
    payload: {
      local_calendar_date: "2026-07-23",
      boundary_at: "2026-07-23T06:00:00+03:00",
    },
    ...overrides,
  };
}

export function setupProjection(): Record<string, JsonValue> {
  const participants = PARTICIPANTS.map((participantId, index) => ({
    participant_id: participantId,
    display_name: `Participant ${index + 1}`,
    participant_order: index + 1,
    status: "active",
  }));
  const onboard = ["navigation", "mooring", "order"];
  return {
    expedition_id: "day1_boundary_test",
    expedition_status: "active",
    team: {
      active_participant_count: 3,
      pending_invitation_count: 0,
      minimum: 3,
      maximum: 5,
      slots_remaining: 2,
    },
    participants,
    invitations: [],
    rotation: {
      status: "generated",
      rotation_id: "rotation_dddddddddddddddddddddddddddddddd",
      rules_version: 2,
      assignments: participants.map((participant, index) => ({
        participant_id: participant.participant_id,
        product_role_id: index === 0 ? "product_captain" : "product_support",
        onboard_role_id: onboard[index],
      })),
    },
    readiness: {
      can_generate_rotation: false,
      can_start_expedition: false,
      blockers: [],
    },
    controls: {
      invite_participant: false,
      revoke_invitation: false,
      generate_rotation: false,
      start_expedition: false,
    },
    expected_projection_version: 1,
    sync_status: "synced",
  };
}

export function systemContext(
  overrides: Partial<SystemExecutionContext> = {},
): SystemExecutionContext {
  return {
    expedition_id: "55000000-0000-0000-0000-0000000000d3",
    expedition_key: "day1_boundary_test",
    expedition_status: "active",
    expedition_timezone: "Europe/Athens",
    day_boundary_local_time: "06:00",
    duration_days: 12,
    stream_position: 2,
    projection_version: 1,
    runtime_release: BOUNDARY_RELEASE,
    actor: null,
    active_stage_id: "onboarding",
    expedition_started_at: "2026-07-23T03:05:00Z",
    projections: [{
      projection_key: "expedition_setup_view",
      projection_type: "expedition_setup_view",
      subject_id: null,
      schema_id: "https://ilka.local/schemas/expedition-setup-view.schema.json",
      schema_version: "1",
      projection: setupProjection(),
      projection_version: 1,
      source_stream_position: 2,
    }],
    ...overrides,
  };
}
