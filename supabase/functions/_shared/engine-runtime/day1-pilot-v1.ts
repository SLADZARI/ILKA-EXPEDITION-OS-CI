import type {
  ActorRole,
  PreparedCommandResult,
  RuntimeBundle,
  RuntimeInput,
} from "../command-gateway/types.ts";
import {
  type BoundaryCardDefinition,
  type BoundaryOutputDefinition,
  createDay1BoundaryRuntime,
  type Day1BoundaryRuntime,
} from "./day1-boundary-v1.ts";
import { createDay1CompleteTaskRuntime } from "./day1-complete-task-v1.ts";
import {
  createExpeditionBootstrapRuntime,
  type ExpeditionBootstrapRuntime,
} from "./expedition-bootstrap-v1.ts";
import {
  createExpeditionInvitationRuntime,
  type ExpeditionInvitationRuntime,
} from "./expedition-invitations-v1.ts";
import {
  createExpeditionRotationRuntime,
  type ExpeditionRotationRuntime,
} from "./expedition-rotation-v1.ts";
import {
  createExpeditionStartRuntime,
  type ExpeditionStartRuntime,
} from "./expedition-start-v1.ts";
import { DAY1_PILOT_POLICY } from "./day1-pilot-policy.generated.ts";

export interface Day1PilotReleaseMetadata {
  release_key: string;
  git_commit_sha: string;
  rules_release: string;
  content_release: string;
  reducer_version: string;
}

export interface Day1PilotRuntime
  extends
    ExpeditionBootstrapRuntime,
    ExpeditionInvitationRuntime,
    ExpeditionRotationRuntime,
    ExpeditionStartRuntime,
    Day1BoundaryRuntime {}

function rejected(code: string, message: string): PreparedCommandResult {
  return {
    status: "rejected",
    events: [],
    projection_mutations: [],
    rejection: { code, message },
  };
}

function mutableCards(
  cards: ReadonlyArray<Readonly<Record<string, unknown>>>,
): BoundaryCardDefinition[] {
  return structuredClone(cards) as unknown as BoundaryCardDefinition[];
}

function mutableCardMap(
  cards: Readonly<Record<string, ReadonlyArray<Readonly<Record<string, unknown>>>>>,
): Record<string, BoundaryCardDefinition[]> {
  return structuredClone(cards) as unknown as Record<
    string,
    BoundaryCardDefinition[]
  >;
}

function mutableOutputs(
  outputs: ReadonlyArray<Readonly<Record<string, unknown>>>,
): BoundaryOutputDefinition[] {
  return structuredClone(outputs) as unknown as BoundaryOutputDefinition[];
}

export function createDay1PilotRuntime(
  metadata: Day1PilotReleaseMetadata,
): Day1PilotRuntime {
  const common = {
    release_key: metadata.release_key,
    git_commit_sha: metadata.git_commit_sha,
    rules_release: metadata.rules_release,
    content_release: metadata.content_release,
    reducer_version: metadata.reducer_version,
  };

  const bootstrap = createExpeditionBootstrapRuntime({
    ...common,
    duration_days: DAY1_PILOT_POLICY.duration_days,
    recovery_days_available: DAY1_PILOT_POLICY.recovery_days_available,
  });
  const invitations = createExpeditionInvitationRuntime({
    ...common,
    team_size_min: DAY1_PILOT_POLICY.team_size_min,
    team_size_max: DAY1_PILOT_POLICY.team_size_max,
    invitation_ttl_hours: DAY1_PILOT_POLICY.invitation_ttl_hours,
  });
  const rotation = createExpeditionRotationRuntime({
    ...common,
    team_size_min: DAY1_PILOT_POLICY.team_size_min,
    team_size_max: DAY1_PILOT_POLICY.team_size_max,
    rotation_rules_version: DAY1_PILOT_POLICY.rotation_rules_version,
    onboard_role_cycle: DAY1_PILOT_POLICY.onboard_role_cycle,
    onboarding_product_captain_role: DAY1_PILOT_POLICY.product_captain_role,
    onboarding_support_role: DAY1_PILOT_POLICY.product_support_role,
  });
  const start = createExpeditionStartRuntime({
    ...common,
    team_size_min: DAY1_PILOT_POLICY.team_size_min,
    team_size_max: DAY1_PILOT_POLICY.team_size_max,
    first_stage_id: DAY1_PILOT_POLICY.first_stage_id,
    rotation_rules_version: DAY1_PILOT_POLICY.rotation_rules_version,
    product_captain_role: DAY1_PILOT_POLICY.product_captain_role,
    product_support_role: DAY1_PILOT_POLICY.product_support_role,
    cook_role: DAY1_PILOT_POLICY.cook_role,
  });
  const boundary = createDay1BoundaryRuntime({
    ...common,
    day_number: DAY1_PILOT_POLICY.day1.day_number,
    stage_id: DAY1_PILOT_POLICY.day1.stage_id,
    stage_title: DAY1_PILOT_POLICY.day1.stage_title,
    next_stage_id: DAY1_PILOT_POLICY.day1.next_stage_id,
    rotation_rules_version: DAY1_PILOT_POLICY.day1.rotation_rules_version,
    product_role_titles: { ...DAY1_PILOT_POLICY.day1.product_role_titles },
    onboard_role_titles: { ...DAY1_PILOT_POLICY.day1.onboard_role_titles },
    shared_cards: mutableCards(DAY1_PILOT_POLICY.day1.shared_cards),
    product_role_cards: mutableCardMap(
      DAY1_PILOT_POLICY.day1.product_role_cards,
    ),
    onboard_role_cards: mutableCardMap(
      DAY1_PILOT_POLICY.day1.onboard_role_cards,
    ),
    required_outputs: mutableOutputs(DAY1_PILOT_POLICY.day1.required_outputs),
  });
  const completeTask = createDay1CompleteTaskRuntime(common);

  const resolveActorRole = async (input: RuntimeInput): Promise<ActorRole> =>
    await completeTask.resolveActorRole(input);

  const reduce = async (input: RuntimeInput): Promise<PreparedCommandResult> => {
    switch (input.command.command_type) {
      case "create_expedition":
        return await bootstrap.reduce(input);
      case "invite_participant":
      case "accept_invitation":
      case "revoke_invitation":
        return await invitations.reduce(input);
      case "generate_rotation":
        return await rotation.reduce(input);
      case "start_expedition":
        return await start.reduce(input);
      case "process_day_boundary":
        return await boundary.reduce(input);
      case "complete_task":
        return await completeTask.reduce(input);
      default:
        return rejected(
          "command_not_implemented_in_runtime",
          `Runtime ${metadata.reducer_version} does not implement ${input.command.command_type}.`,
        );
    }
  };

  return Object.freeze({
    ...common,
    bootstrap_policy: bootstrap.bootstrap_policy,
    invitation_policy: invitations.invitation_policy,
    rotation_policy: rotation.rotation_policy,
    start_policy: start.start_policy,
    day1_policy: boundary.day1_policy,
    resolveActorRole,
    reduce,
    reduceBoundary: boundary.reduceBoundary,
  });
}

export function isDay1PilotRuntime(
  runtime: RuntimeBundle,
): runtime is Day1PilotRuntime {
  const candidate = runtime as Partial<Day1PilotRuntime>;
  return candidate.bootstrap_policy !== undefined &&
    candidate.invitation_policy !== undefined &&
    candidate.rotation_policy !== undefined &&
    candidate.start_policy !== undefined &&
    candidate.day1_policy !== undefined &&
    typeof candidate.reduceBoundary === "function";
}
