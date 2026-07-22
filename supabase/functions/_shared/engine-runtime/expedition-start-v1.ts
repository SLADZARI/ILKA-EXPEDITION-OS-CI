import type {
  ActorRole,
  JsonValue,
  PreparedCommandResult,
  PreparedProjectionMutation,
  ProjectionDocument,
  RuntimeBundle,
  RuntimeInput,
} from "../command-gateway/types.ts";

export const START_SETUP_VIEW_SCHEMA_ID =
  "https://ilka.local/schemas/expedition-setup-view.schema.json";
export const START_SETUP_VIEW_SCHEMA_VERSION = "1";

export interface ExpeditionStartReleaseMetadata {
  release_key: string;
  git_commit_sha: string;
  rules_release: string;
  content_release: string;
  reducer_version: string;
  team_size_min: number;
  team_size_max: number;
  first_stage_id: string;
  rotation_rules_version: number;
  product_captain_role: string;
  product_support_role: string;
  cook_role: string;
}

export interface ExpeditionStartRuntime extends RuntimeBundle {
  readonly start_policy: {
    team_size_min: number;
    team_size_max: number;
    first_stage_id: string;
    rotation_rules_version: number;
    product_captain_role: string;
    product_support_role: string;
    cook_role: string;
  };
}

type JsonObject = Record<string, JsonValue>;

type SetupParticipant = {
  participant_id: string;
  display_name: string;
  participant_order: number;
  status: "active" | "banned";
};

type SetupInvitation = {
  invitation_id: string;
  email_hint: string;
  role: "participant";
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  accepted_participant_id: string | null;
};

type SetupAssignment = {
  participant_id: string;
  product_role_id: string;
  onboard_role_id: string;
};

type ExpeditionSetupView = {
  expedition_id: string;
  expedition_status: string;
  team: {
    active_participant_count: number;
    pending_invitation_count: number;
    minimum: number;
    maximum: number;
    slots_remaining: number;
  };
  participants: SetupParticipant[];
  invitations: SetupInvitation[];
  rotation: {
    status: "not_generated" | "generated";
    rotation_id: string | null;
    rules_version: number | null;
    assignments: SetupAssignment[];
  };
  readiness: {
    can_generate_rotation: boolean;
    can_start_expedition: boolean;
    blockers: Array<{ code: string; message: string; entity_id: string | null }>;
  };
  controls: {
    invite_participant: boolean;
    revoke_invitation: boolean;
    generate_rotation: boolean;
    start_expedition: boolean;
  };
  expected_projection_version: number;
  sync_status: "synced";
};

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rejected(code: string, message: string): PreparedCommandResult {
  return {
    status: "rejected",
    events: [],
    projection_mutations: [],
    rejection: { code, message },
  };
}

function eventId(commandId: string, ordinal: number): string {
  return `evt_${commandId.slice(4)}_${String(ordinal).padStart(2, "0")}`;
}

function membershipActorId(membershipId: string): string {
  return `member_${membershipId.replaceAll("-", "")}`;
}

function setupProjection(input: RuntimeInput): ProjectionDocument | null {
  const document = input.context.projections.find((candidate) =>
    candidate.projection_key === "expedition_setup_view"
  );
  if (!document) return null;
  if (
    document.projection_type !== "expedition_setup_view" ||
    document.subject_id !== null ||
    document.schema_id !== START_SETUP_VIEW_SCHEMA_ID ||
    document.schema_version !== START_SETUP_VIEW_SCHEMA_VERSION
  ) {
    return null;
  }
  return document;
}

function asSetupView(value: JsonObject): ExpeditionSetupView | null {
  if (
    typeof value.expedition_id !== "string" ||
    typeof value.expedition_status !== "string" ||
    !isObject(value.team) ||
    !Array.isArray(value.participants) ||
    !Array.isArray(value.invitations) ||
    !isObject(value.rotation) ||
    !isObject(value.readiness) ||
    !isObject(value.controls) ||
    typeof value.expected_projection_version !== "number" ||
    value.sync_status !== "synced"
  ) return null;
  return value as unknown as ExpeditionSetupView;
}

function event(
  input: RuntimeInput,
  ordinal: number,
  eventType: string,
  stageId: string | null,
  payload: JsonObject,
): JsonObject {
  return {
    event_id: eventId(input.command.command_id, ordinal),
    event_type: eventType,
    occurred_at: input.command.issued_at,
    recorded_at: input.received_at,
    actor_id: input.actor_id,
    actor_role: input.actor_role,
    expedition_id: input.context.expedition_key,
    day_number: null,
    stage_id: stageId,
    day_revision: null,
    command_id: input.command.command_id,
    idempotency_key: input.command.command_id,
    schema_version: 1,
    payload,
  };
}

function mutation(view: ExpeditionSetupView): PreparedProjectionMutation {
  return {
    operation: "upsert",
    projection_key: "expedition_setup_view",
    projection_type: "expedition_setup_view",
    subject_id: null,
    schema_id: START_SETUP_VIEW_SCHEMA_ID,
    schema_version: START_SETUP_VIEW_SCHEMA_VERSION,
    projection: view as unknown as JsonObject,
  };
}

function validateCaptain(input: RuntimeInput): PreparedCommandResult | null {
  const actor = input.context.actor;
  if (
    !actor || actor.membership_role !== "captain" ||
    actor.participant_id !== null || actor.participant_key !== null
  ) {
    return rejected(
      "active_captain_membership_required",
      "An active Captain membership is required to start the Expedition.",
    );
  }
  const expectedActorId = membershipActorId(actor.membership_id);
  if (
    input.actor_id !== expectedActorId ||
    input.command.actor_id !== expectedActorId ||
    input.actor_role !== "captain" ||
    input.command.actor_role !== "captain"
  ) {
    return rejected(
      "actor_spoofing_detected",
      "The canonical actor does not match the active Captain membership.",
    );
  }
  return null;
}

function validateFrozenTeam(
  view: ExpeditionSetupView,
  policy: ExpeditionStartRuntime["start_policy"],
): string | null {
  const active = view.participants
    .filter((participant) => participant.status === "active")
    .sort((left, right) => left.participant_order - right.participant_order);
  const pending = view.invitations.filter((invitation) =>
    invitation.status === "pending"
  );
  if (
    active.length < policy.team_size_min ||
    active.length > policy.team_size_max ||
    pending.length !== 0 ||
    view.team.active_participant_count !== active.length ||
    view.team.pending_invitation_count !== 0
  ) return "team_not_frozen";

  const participantIds = active.map((participant) => participant.participant_id);
  const orders = active.map((participant) => participant.participant_order);
  if (
    new Set(participantIds).size !== active.length ||
    new Set(orders).size !== active.length ||
    orders.some((order) => !Number.isInteger(order) || order < 1 || order > 5)
  ) return "team_not_frozen";

  if (
    view.rotation.status !== "generated" ||
    typeof view.rotation.rotation_id !== "string" ||
    !/^rotation_[a-f0-9]{32}$/.test(view.rotation.rotation_id) ||
    view.rotation.rules_version !== policy.rotation_rules_version ||
    view.rotation.assignments.length !== active.length
  ) return "rotation_not_ready";

  const activeIds = new Set(participantIds);
  const assignmentIds = view.rotation.assignments.map((item) => item.participant_id);
  if (
    new Set(assignmentIds).size !== active.length ||
    assignmentIds.some((participantId) => !activeIds.has(participantId))
  ) return "rotation_not_ready";

  const productCaptainCount =
    view.rotation.assignments.filter((assignment) =>
      assignment.product_role_id === policy.product_captain_role
    ).length;
  if (productCaptainCount !== 1) return "rotation_not_ready";
  if (
    view.rotation.assignments.some((assignment) =>
      ![policy.product_captain_role, policy.product_support_role].includes(
        assignment.product_role_id,
      ) ||
      (assignment.onboard_role_id === policy.cook_role &&
        assignment.product_role_id !== policy.product_support_role)
    )
  ) return "rotation_not_ready";

  return null;
}

async function reduceStart(
  input: RuntimeInput,
  policy: ExpeditionStartRuntime["start_policy"],
): Promise<PreparedCommandResult> {
  if (input.command.command_type !== "start_expedition") {
    return rejected(
      "command_not_implemented_in_runtime",
      `Runtime ${input.context.runtime_release.reducer_version} does not implement ${input.command.command_type}.`,
    );
  }
  if (
    input.command.day_number != null || input.command.stage_id != null ||
    input.command.day_revision != null ||
    Object.keys(input.command.payload).length !== 0
  ) {
    return rejected(
      "validation_failed",
      "start_expedition requires empty payload and no Day or Stage context.",
    );
  }
  if (input.context.expedition_status !== "ready") {
    return rejected(
      input.context.expedition_status === "active"
        ? "expedition_already_started"
        : "expedition_not_ready",
      "The Expedition can start only from ready state.",
    );
  }
  const actorRejection = validateCaptain(input);
  if (actorRejection) return actorRejection;
  if (
    input.context.projections.some((document) =>
      document.projection_type === "today_view" ||
      document.projection_type === "captain_day_view"
    )
  ) {
    return rejected(
      "calendar_day_already_exists",
      "The Expedition already has authoritative Day projections.",
    );
  }

  const document = setupProjection(input);
  if (!document) {
    return rejected(
      "expedition_setup_projection_missing",
      "The authoritative ExpeditionSetupView is unavailable or incompatible.",
    );
  }
  const parsed = asSetupView(document.projection);
  if (
    !parsed || parsed.expedition_id !== input.context.expedition_key ||
    parsed.expedition_status !== "ready" ||
    parsed.expected_projection_version !== input.context.projection_version ||
    parsed.team.minimum !== policy.team_size_min ||
    parsed.team.maximum !== policy.team_size_max
  ) {
    return rejected(
      "projection_contract_mismatch",
      "The authoritative ExpeditionSetupView does not match the pinned runtime context.",
    );
  }
  if (
    parsed.readiness.can_start_expedition !== true ||
    parsed.controls.start_expedition !== true
  ) {
    return rejected(
      "expedition_not_ready",
      "The setup projection is not ready to start.",
    );
  }
  const frozenError = validateFrozenTeam(parsed, policy);
  if (frozenError) {
    return rejected(
      frozenError,
      frozenError === "team_not_frozen"
        ? "The ready team is not frozen or complete."
        : "The generated Rotation Plan is unavailable or incompatible.",
    );
  }
  if (policy.first_stage_id !== "onboarding") {
    return rejected(
      "first_stage_unresolvable",
      "The pinned runtime does not resolve onboarding as the first Stage.",
    );
  }

  const view = structuredClone(parsed);
  view.expedition_status = "active";
  view.readiness = {
    can_generate_rotation: false,
    can_start_expedition: false,
    blockers: [],
  };
  view.controls = {
    invite_participant: false,
    revoke_invitation: false,
    generate_rotation: false,
    start_expedition: false,
  };
  view.expected_projection_version = input.context.projection_version + 1;
  view.sync_status = "synced";

  return {
    status: "accepted",
    events: [
      event(input, 1, "expedition.started", null, {}),
      event(input, 2, "stage.opened", policy.first_stage_id, {
        stage_id: policy.first_stage_id,
      }),
    ],
    projection_mutations: [mutation(view)],
    rejection: null,
  };
}

async function resolveActorRole(input: RuntimeInput): Promise<ActorRole> {
  return input.actor_role;
}

export function createExpeditionStartRuntime(
  metadata: ExpeditionStartReleaseMetadata,
): ExpeditionStartRuntime {
  if (
    !Number.isInteger(metadata.team_size_min) ||
    !Number.isInteger(metadata.team_size_max) ||
    metadata.team_size_min < 1 ||
    metadata.team_size_max < metadata.team_size_min ||
    metadata.team_size_max > 5
  ) throw new Error("invalid_start_team_policy");
  if (metadata.first_stage_id !== "onboarding") {
    throw new Error("invalid_first_stage_policy");
  }
  if (
    !Number.isInteger(metadata.rotation_rules_version) ||
    metadata.rotation_rules_version < 1
  ) throw new Error("invalid_start_rotation_policy");
  if (
    metadata.product_captain_role !== "product_captain" ||
    metadata.product_support_role !== "product_support" ||
    metadata.cook_role !== "cook"
  ) throw new Error("invalid_start_role_policy");

  const startPolicy = Object.freeze({
    team_size_min: metadata.team_size_min,
    team_size_max: metadata.team_size_max,
    first_stage_id: metadata.first_stage_id,
    rotation_rules_version: metadata.rotation_rules_version,
    product_captain_role: metadata.product_captain_role,
    product_support_role: metadata.product_support_role,
    cook_role: metadata.cook_role,
  });

  return Object.freeze({
    release_key: metadata.release_key,
    git_commit_sha: metadata.git_commit_sha,
    rules_release: metadata.rules_release,
    content_release: metadata.content_release,
    reducer_version: metadata.reducer_version,
    start_policy: startPolicy,
    resolveActorRole,
    reduce: async (input: RuntimeInput) => reduceStart(input, startPolicy),
  });
}

export function isExpeditionStartRuntime(
  value: RuntimeBundle,
): value is ExpeditionStartRuntime {
  const candidate = value as Partial<ExpeditionStartRuntime>;
  return candidate.start_policy !== undefined &&
    Number.isInteger(candidate.start_policy.team_size_min) &&
    Number.isInteger(candidate.start_policy.team_size_max) &&
    candidate.start_policy.first_stage_id === "onboarding" &&
    Number.isInteger(candidate.start_policy.rotation_rules_version);
}
