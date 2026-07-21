import type {
  ActorRole,
  JsonValue,
  PreparedCommandResult,
  PreparedProjectionMutation,
  ProjectionDocument,
  RuntimeBundle,
  RuntimeInput,
} from "../command-gateway/types.ts";

export const ROTATION_SETUP_VIEW_SCHEMA_ID =
  "https://ilka.local/schemas/expedition-setup-view.schema.json";
export const ROTATION_SETUP_VIEW_SCHEMA_VERSION = "1";

export interface ExpeditionRotationReleaseMetadata {
  release_key: string;
  git_commit_sha: string;
  rules_release: string;
  content_release: string;
  reducer_version: string;
  team_size_min: number;
  team_size_max: number;
  rotation_rules_version: number;
  onboard_role_cycle: readonly string[];
  onboarding_product_captain_role: string;
  onboarding_support_role: string;
}

export interface ExpeditionRotationRuntime extends RuntimeBundle {
  readonly rotation_policy: {
    team_size_min: number;
    team_size_max: number;
    rotation_rules_version: number;
    onboard_role_cycle: readonly string[];
    onboarding_product_captain_role: string;
    onboarding_support_role: string;
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
    blockers: Array<{
      code: string;
      message: string;
      entity_id: string | null;
    }>;
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
    document.schema_id !== ROTATION_SETUP_VIEW_SCHEMA_ID ||
    document.schema_version !== ROTATION_SETUP_VIEW_SCHEMA_VERSION
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
  ) {
    return null;
  }
  return value as unknown as ExpeditionSetupView;
}

function event(
  input: RuntimeInput,
  ordinal: number,
  eventType: string,
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
    stage_id: null,
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
    schema_id: ROTATION_SETUP_VIEW_SCHEMA_ID,
    schema_version: ROTATION_SETUP_VIEW_SCHEMA_VERSION,
    projection: view as unknown as JsonObject,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function validateCaptain(input: RuntimeInput): PreparedCommandResult | null {
  const actor = input.context.actor;
  if (
    !actor ||
    actor.membership_role !== "captain" ||
    actor.participant_id !== null ||
    actor.participant_key !== null
  ) {
    return rejected(
      "active_captain_membership_required",
      "An active Captain membership is required to generate rotation.",
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

async function reduceRotation(
  input: RuntimeInput,
  policy: ExpeditionRotationRuntime["rotation_policy"],
): Promise<PreparedCommandResult> {
  if (input.command.command_type !== "generate_rotation") {
    return rejected(
      "command_not_implemented_in_runtime",
      `Runtime ${input.context.runtime_release.reducer_version} does not implement ${input.command.command_type}.`,
    );
  }
  if (
    input.command.day_number != null ||
    input.command.stage_id != null ||
    input.command.day_revision != null ||
    Object.keys(input.command.payload).length !== 0
  ) {
    return rejected(
      "validation_failed",
      "generate_rotation requires empty payload and no Day or Stage context.",
    );
  }
  if (input.context.expedition_status !== "draft") {
    return rejected(
      "expedition_not_in_setup",
      "Rotation can be generated only while the Expedition is in draft setup.",
    );
  }
  const actorRejection = validateCaptain(input);
  if (actorRejection) return actorRejection;

  const document = setupProjection(input);
  if (!document) {
    return rejected(
      "expedition_setup_projection_missing",
      "The authoritative ExpeditionSetupView is unavailable or incompatible.",
    );
  }
  const parsed = asSetupView(document.projection);
  if (
    !parsed ||
    parsed.expedition_id !== input.context.expedition_key ||
    parsed.expedition_status !== "draft" ||
    parsed.expected_projection_version !== input.context.projection_version ||
    parsed.team.minimum !== policy.team_size_min ||
    parsed.team.maximum !== policy.team_size_max
  ) {
    return rejected(
      "projection_contract_mismatch",
      "The authoritative ExpeditionSetupView does not match the pinned runtime context.",
    );
  }
  if (parsed.rotation.status !== "not_generated") {
    return rejected(
      "rotation_already_generated",
      "The initial Rotation Plan has already been generated.",
    );
  }

  const activeParticipants = parsed.participants
    .filter((participant) => participant.status === "active")
    .sort((left, right) => left.participant_order - right.participant_order);
  const pendingInvitations = parsed.invitations.filter((invitation) =>
    invitation.status === "pending"
  );
  if (pendingInvitations.length > 0) {
    return rejected(
      "pending_invitations_exist",
      "All pending invitations must reach a terminal state before rotation.",
    );
  }
  if (
    activeParticipants.length < policy.team_size_min ||
    activeParticipants.length > policy.team_size_max
  ) {
    return rejected(
      "rotation_not_ready",
      `Rotation requires ${policy.team_size_min}–${policy.team_size_max} active Participants.`,
    );
  }
  if (
    parsed.team.active_participant_count !== activeParticipants.length ||
    parsed.team.pending_invitation_count !== pendingInvitations.length
  ) {
    return rejected(
      "projection_contract_mismatch",
      "The setup team counters do not match authoritative Participant and invitation entries.",
    );
  }

  const participantOrders = activeParticipants.map((participant) =>
    participant.participant_order
  );
  if (
    participantOrders.some((order) =>
      !Number.isInteger(order) || order < 1 || order > policy.team_size_max
    ) || new Set(participantOrders).size !== participantOrders.length
  ) {
    return rejected(
      "participant_order_unavailable",
      "Active Participants must have unique stable orders in the supported range.",
    );
  }

  const withOnboardRole = activeParticipants.map((participant) => ({
    participant,
    onboard_role_id: policy.onboard_role_cycle[
      (participant.participant_order - 1) % policy.onboard_role_cycle.length
    ],
  }));
  const productCaptain = withOnboardRole.find((candidate) =>
    candidate.onboard_role_id !== "cook"
  );
  if (!productCaptain) {
    return rejected(
      "rotation_not_ready",
      "No compatible Product Captain assignment is available.",
    );
  }

  const assignments: SetupAssignment[] = withOnboardRole.map((candidate) => ({
    participant_id: candidate.participant.participant_id,
    product_role_id: candidate.participant.participant_id ===
        productCaptain.participant.participant_id
      ? policy.onboarding_product_captain_role
      : policy.onboarding_support_role,
    onboard_role_id: candidate.onboard_role_id,
  }));

  const seedMaterial = [
    input.context.expedition_key,
    String(policy.rotation_rules_version),
    ...activeParticipants.map((participant) =>
      `${participant.participant_id}:${participant.participant_order}`
    ),
  ].join("|");
  const seed = await sha256Hex(seedMaterial);
  const rotationId = `rotation_${seed.slice(0, 32)}`;

  const view = structuredClone(parsed);
  view.expedition_status = "ready";
  view.rotation = {
    status: "generated",
    rotation_id: rotationId,
    rules_version: policy.rotation_rules_version,
    assignments,
  };
  view.readiness = {
    can_generate_rotation: false,
    can_start_expedition: true,
    blockers: [],
  };
  view.controls = {
    invite_participant: false,
    revoke_invitation: false,
    generate_rotation: false,
    start_expedition: true,
  };
  view.expected_projection_version = input.context.projection_version + 1;
  view.sync_status = "synced";

  return {
    status: "accepted",
    events: [
      event(input, 1, "rotation.generated", {
        rotation_id: rotationId,
        seed,
        rules_version: policy.rotation_rules_version,
        assignments: assignments as unknown as JsonValue,
      }),
      event(input, 2, "expedition.ready", {
        rotation_id: rotationId,
      }),
    ],
    projection_mutations: [mutation(view)],
    rejection: null,
  };
}

async function resolveActorRole(input: RuntimeInput): Promise<ActorRole> {
  return input.actor_role;
}

export function createExpeditionRotationRuntime(
  metadata: ExpeditionRotationReleaseMetadata,
): ExpeditionRotationRuntime {
  if (
    !Number.isInteger(metadata.team_size_min) ||
    !Number.isInteger(metadata.team_size_max) ||
    metadata.team_size_min < 1 ||
    metadata.team_size_max < metadata.team_size_min ||
    metadata.team_size_max > 5
  ) {
    throw new Error("invalid_rotation_team_policy");
  }
  if (
    !Number.isInteger(metadata.rotation_rules_version) ||
    metadata.rotation_rules_version < 1
  ) {
    throw new Error("invalid_rotation_rules_version");
  }
  if (
    metadata.onboard_role_cycle.length !== 5 ||
    new Set(metadata.onboard_role_cycle).size !== 5 ||
    !metadata.onboard_role_cycle.includes("cook")
  ) {
    throw new Error("invalid_onboard_role_cycle");
  }
  if (
    metadata.onboarding_product_captain_role !== "product_captain" ||
    metadata.onboarding_support_role !== "product_support"
  ) {
    throw new Error("invalid_onboarding_product_role_policy");
  }

  const rotationPolicy = Object.freeze({
    team_size_min: metadata.team_size_min,
    team_size_max: metadata.team_size_max,
    rotation_rules_version: metadata.rotation_rules_version,
    onboard_role_cycle: Object.freeze([...metadata.onboard_role_cycle]),
    onboarding_product_captain_role: metadata.onboarding_product_captain_role,
    onboarding_support_role: metadata.onboarding_support_role,
  });

  return Object.freeze({
    release_key: metadata.release_key,
    git_commit_sha: metadata.git_commit_sha,
    rules_release: metadata.rules_release,
    content_release: metadata.content_release,
    reducer_version: metadata.reducer_version,
    rotation_policy: rotationPolicy,
    resolveActorRole,
    reduce: async (input: RuntimeInput) => reduceRotation(input, rotationPolicy),
  });
}

export function isExpeditionRotationRuntime(
  value: RuntimeBundle,
): value is ExpeditionRotationRuntime {
  const candidate = value as Partial<ExpeditionRotationRuntime>;
  return candidate.rotation_policy !== undefined &&
    Number.isInteger(candidate.rotation_policy.team_size_min) &&
    Number.isInteger(candidate.rotation_policy.team_size_max) &&
    Number.isInteger(candidate.rotation_policy.rotation_rules_version) &&
    Array.isArray(candidate.rotation_policy.onboard_role_cycle);
}
