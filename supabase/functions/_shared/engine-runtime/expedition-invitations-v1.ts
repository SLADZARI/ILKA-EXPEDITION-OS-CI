import type {
  ActorRole,
  GatewayExecutionContext,
  JsonValue,
  PreparedCommandResult,
  PreparedProjectionMutation,
  ProjectionDocument,
  RuntimeBundle,
  RuntimeInput,
} from "../command-gateway/types.ts";

export const EXPEDITION_SETUP_VIEW_SCHEMA_ID =
  "https://ilka.local/schemas/expedition-setup-view.schema.json";
export const EXPEDITION_SETUP_VIEW_SCHEMA_VERSION = "1";

export interface ExpeditionInvitationReleaseMetadata {
  release_key: string;
  git_commit_sha: string;
  rules_release: string;
  content_release: string;
  reducer_version: string;
  team_size_min: number;
  team_size_max: number;
  invitation_ttl_hours: number;
}

export type InvitationOperation =
  | {
    kind: "invite";
    invitation_id: string;
    email_hint: string;
    expires_at: string;
  }
  | {
    kind: "accept";
    invitation_id: string;
    participant_id: string;
    display_name: string;
    participant_order: number;
  }
  | {
    kind: "revoke";
    invitation_id: string;
    reason: string;
  };

export interface InvitationExecutionContext extends GatewayExecutionContext {
  invitation_operation: InvitationOperation;
}

export interface ExpeditionInvitationRuntime extends RuntimeBundle {
  readonly invitation_policy: {
    team_size_min: number;
    team_size_max: number;
    invitation_ttl_hours: number;
  };
}

type JsonObject = Record<string, JsonValue>;

type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

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
  status: InvitationStatus;
  expires_at: string;
  accepted_participant_id: string | null;
};

type SetupRotation = {
  status: "not_generated" | "generated";
  rotation_id: string | null;
  rules_version: number | null;
  assignments: JsonObject[];
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
  rotation: SetupRotation;
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
    document.schema_id !== EXPEDITION_SETUP_VIEW_SCHEMA_ID ||
    document.schema_version !== EXPEDITION_SETUP_VIEW_SCHEMA_VERSION
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

function initialView(
  input: RuntimeInput,
  policy: ExpeditionInvitationRuntime["invitation_policy"],
): ExpeditionSetupView {
  return {
    expedition_id: input.context.expedition_key,
    expedition_status: "draft",
    team: {
      active_participant_count: 0,
      pending_invitation_count: 0,
      minimum: policy.team_size_min,
      maximum: policy.team_size_max,
      slots_remaining: policy.team_size_max,
    },
    participants: [],
    invitations: [],
    rotation: {
      status: "not_generated",
      rotation_id: null,
      rules_version: null,
      assignments: [],
    },
    readiness: {
      can_generate_rotation: false,
      can_start_expedition: false,
      blockers: [],
    },
    controls: {
      invite_participant: true,
      revoke_invitation: false,
      generate_rotation: false,
      start_expedition: false,
    },
    expected_projection_version: 0,
    sync_status: "synced",
  };
}

function recalculate(
  view: ExpeditionSetupView,
  projectionVersion: number,
  policy: ExpeditionInvitationRuntime["invitation_policy"],
): void {
  const activeParticipants =
    view.participants.filter((participant) => participant.status === "active").length;
  const pendingInvitations = view.invitations.filter((invitation) =>
    invitation.status === "pending"
  );
  const occupiedSlots = activeParticipants + pendingInvitations.length;
  const canGenerateRotation = view.expedition_status === "draft" &&
    activeParticipants >= policy.team_size_min &&
    activeParticipants <= policy.team_size_max &&
    pendingInvitations.length === 0 &&
    view.rotation.status === "not_generated";
  const canStartExpedition = view.expedition_status === "ready" &&
    view.rotation.status === "generated";

  const blockers: ExpeditionSetupView["readiness"]["blockers"] = [];
  if (activeParticipants < policy.team_size_min) {
    blockers.push({
      code: "team_minimum_not_met",
      message: `At least ${policy.team_size_min} active Participants are required.`,
      entity_id: null,
    });
  }
  for (const invitation of pendingInvitations) {
    blockers.push({
      code: "pending_invitation",
      message: "A pending invitation must reach a terminal state before rotation.",
      entity_id: invitation.invitation_id,
    });
  }
  if (view.rotation.status !== "generated") {
    blockers.push({
      code: "rotation_not_generated",
      message: "The deterministic Rotation Plan has not been generated.",
      entity_id: null,
    });
  }

  view.team = {
    active_participant_count: activeParticipants,
    pending_invitation_count: pendingInvitations.length,
    minimum: policy.team_size_min,
    maximum: policy.team_size_max,
    slots_remaining: Math.max(0, policy.team_size_max - occupiedSlots),
  };
  view.readiness = {
    can_generate_rotation: canGenerateRotation,
    can_start_expedition: canStartExpedition,
    blockers,
  };
  view.controls = {
    invite_participant: view.expedition_status === "draft" &&
      occupiedSlots < policy.team_size_max,
    revoke_invitation: view.expedition_status === "draft" &&
      pendingInvitations.length > 0,
    generate_rotation: canGenerateRotation,
    start_expedition: canStartExpedition,
  };
  view.expected_projection_version = projectionVersion;
  view.sync_status = "synced";
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
    schema_id: EXPEDITION_SETUP_VIEW_SCHEMA_ID,
    schema_version: EXPEDITION_SETUP_VIEW_SCHEMA_VERSION,
    projection: view as unknown as JsonObject,
  };
}

function pruneTerminalInvitation(view: ExpeditionSetupView): boolean {
  const index = view.invitations.findIndex((invitation) =>
    invitation.status === "revoked" || invitation.status === "expired"
  );
  if (index < 0) return false;
  view.invitations.splice(index, 1);
  return true;
}

function validateCommon(
  input: RuntimeInput,
  operation: InvitationOperation,
): PreparedCommandResult | null {
  if (input.context.expedition_status !== "draft") {
    return rejected(
      "expedition_not_in_setup",
      "Invitation commands are available only while the Expedition is in draft setup.",
    );
  }
  if (
    input.command.day_number != null ||
    input.command.stage_id != null ||
    input.command.day_revision != null
  ) {
    return rejected(
      "validation_failed",
      "Invitation commands cannot include Day, Stage or Day revision context.",
    );
  }
  const expectedKind = input.command.command_type === "invite_participant"
    ? "invite"
    : input.command.command_type === "accept_invitation"
    ? "accept"
    : input.command.command_type === "revoke_invitation"
    ? "revoke"
    : null;
  if (expectedKind === null) {
    return rejected(
      "command_not_implemented_in_runtime",
      `Runtime ${input.context.runtime_release.reducer_version} does not implement ${input.command.command_type}.`,
    );
  }
  if (operation.kind !== expectedKind) {
    return rejected(
      "runtime_contract_invalid",
      "The trusted invitation operation does not match the canonical command.",
    );
  }
  return null;
}

function validateActor(input: RuntimeInput): PreparedCommandResult | null {
  const actor = input.context.actor;
  if (!actor) {
    return rejected("active_profile_required", "A trusted actor context is required.");
  }
  const expectedActorId = membershipActorId(actor.membership_id);
  if (
    input.actor_id !== expectedActorId || input.command.actor_id !== expectedActorId
  ) {
    return rejected(
      "profile_actor_mismatch",
      "The canonical actor does not match the prepared membership.",
    );
  }

  if (input.command.command_type === "accept_invitation") {
    if (
      input.actor_role !== "participant" ||
      input.command.actor_role !== "participant" ||
      actor.membership_role !== "participant" ||
      actor.participant_id !== null ||
      actor.participant_key !== null
    ) {
      return rejected(
        "permission_denied",
        "Invitation acceptance requires the prepared participant membership actor.",
      );
    }
    return null;
  }

  if (
    input.actor_role !== "captain" ||
    input.command.actor_role !== "captain" ||
    actor.membership_role !== "captain" ||
    actor.participant_id !== null ||
    actor.participant_key !== null
  ) {
    return rejected(
      "permission_denied",
      "Only the active Expedition Captain may manage invitations.",
    );
  }
  return null;
}

function reduceInvitation(
  input: RuntimeInput,
  policy: ExpeditionInvitationRuntime["invitation_policy"],
): PreparedCommandResult {
  const context = input.context as InvitationExecutionContext;
  const operation = context.invitation_operation;
  if (!operation) {
    return rejected(
      "runtime_contract_invalid",
      "The trusted invitation operation is missing.",
    );
  }

  const commonRejection = validateCommon(input, operation);
  if (commonRejection) return commonRejection;
  const actorRejection = validateActor(input);
  if (actorRejection) return actorRejection;

  const document = setupProjection(input);
  let view: ExpeditionSetupView;
  if (!document) {
    if (
      operation.kind !== "invite" ||
      input.context.projection_version !== 0 ||
      input.context.projections.some((candidate) =>
        candidate.projection_type === "expedition_setup_view"
      )
    ) {
      return rejected(
        "expedition_setup_projection_missing",
        "The authoritative ExpeditionSetupView is unavailable or incompatible.",
      );
    }
    view = initialView(input, policy);
  } else {
    const parsed = asSetupView(document.projection);
    if (
      !parsed ||
      parsed.expedition_id !== input.context.expedition_key ||
      parsed.expected_projection_version !== input.context.projection_version ||
      parsed.team.minimum !== policy.team_size_min ||
      parsed.team.maximum !== policy.team_size_max
    ) {
      return rejected(
        "projection_contract_mismatch",
        "The authoritative ExpeditionSetupView does not match the pinned runtime context.",
      );
    }
    view = structuredClone(parsed);
  }

  if (view.expedition_status !== "draft") {
    return rejected(
      "expedition_not_in_setup",
      "Invitation commands are available only while the Expedition is in draft setup.",
    );
  }

  const events: JsonObject[] = [];
  if (operation.kind === "invite") {
    if (
      view.invitations.some((candidate) =>
        candidate.invitation_id === operation.invitation_id
      )
    ) {
      return rejected(
        "pending_invitation_already_exists",
        "The invitation already exists in the authoritative setup projection.",
      );
    }
    while (view.invitations.length >= policy.team_size_max) {
      if (!pruneTerminalInvitation(view)) {
        return rejected(
          "team_capacity_reached",
          "No invitation projection slot is available.",
        );
      }
    }
    if (
      view.participants.filter((participant) => participant.status === "active")
            .length +
          view.invitations.filter((invitation) => invitation.status === "pending")
            .length >=
        policy.team_size_max
    ) {
      return rejected("team_capacity_reached", "The Expedition team is full.");
    }
    view.invitations.push({
      invitation_id: operation.invitation_id,
      email_hint: operation.email_hint,
      role: "participant",
      status: "pending",
      expires_at: operation.expires_at,
      accepted_participant_id: null,
    });
    events.push(event(input, 1, "invitation.created", {
      invitation_id: operation.invitation_id,
      email_hint: operation.email_hint,
      role: "participant",
      expires_at: operation.expires_at,
    }));
  } else if (operation.kind === "accept") {
    const invitation = view.invitations.find((candidate) =>
      candidate.invitation_id === operation.invitation_id
    );
    if (!invitation) {
      return rejected("invitation_not_found", "The invitation was not found.");
    }
    if (invitation.status !== "pending") {
      return rejected(
        "invitation_not_pending",
        "The invitation has already reached a terminal state.",
      );
    }
    if (
      view.participants.some((participant) =>
        participant.participant_id === operation.participant_id ||
        participant.participant_order === operation.participant_order
      )
    ) {
      return rejected(
        "participant_already_member",
        "The prepared Participant identity is already present.",
      );
    }
    invitation.status = "accepted";
    invitation.accepted_participant_id = operation.participant_id;
    view.participants.push({
      participant_id: operation.participant_id,
      display_name: operation.display_name,
      participant_order: operation.participant_order,
      status: "active",
    });
    view.participants.sort((left, right) =>
      left.participant_order - right.participant_order
    );
    events.push(
      event(input, 1, "invitation.accepted", {
        invitation_id: operation.invitation_id,
        participant_id: operation.participant_id,
      }),
      event(input, 2, "participant.added", {
        participant_id: operation.participant_id,
        display_name: operation.display_name,
        participant_order: operation.participant_order,
      }),
    );
  } else {
    const invitation = view.invitations.find((candidate) =>
      candidate.invitation_id === operation.invitation_id
    );
    if (!invitation) {
      return rejected("invitation_not_found", "The invitation was not found.");
    }
    if (invitation.status !== "pending") {
      return rejected(
        "invitation_not_pending",
        "The invitation has already reached a terminal state.",
      );
    }
    invitation.status = "revoked";
    events.push(event(input, 1, "invitation.revoked", {
      invitation_id: operation.invitation_id,
      reason: operation.reason,
    }));
  }

  recalculate(view, input.context.projection_version + 1, policy);
  return {
    status: "accepted",
    events,
    projection_mutations: [mutation(view)],
    rejection: null,
  };
}

async function resolveActorRole(input: RuntimeInput): Promise<ActorRole> {
  return input.actor_role;
}

export function createExpeditionInvitationRuntime(
  metadata: ExpeditionInvitationReleaseMetadata,
): ExpeditionInvitationRuntime {
  if (
    !Number.isInteger(metadata.team_size_min) ||
    !Number.isInteger(metadata.team_size_max) ||
    metadata.team_size_min < 1 ||
    metadata.team_size_max < metadata.team_size_min ||
    metadata.team_size_max > 5
  ) {
    throw new Error("invalid_invitation_team_policy");
  }
  if (
    !Number.isInteger(metadata.invitation_ttl_hours) ||
    metadata.invitation_ttl_hours < 1
  ) {
    throw new Error("invalid_invitation_ttl_policy");
  }

  const invitationPolicy = Object.freeze({
    team_size_min: metadata.team_size_min,
    team_size_max: metadata.team_size_max,
    invitation_ttl_hours: metadata.invitation_ttl_hours,
  });

  return Object.freeze({
    release_key: metadata.release_key,
    git_commit_sha: metadata.git_commit_sha,
    rules_release: metadata.rules_release,
    content_release: metadata.content_release,
    reducer_version: metadata.reducer_version,
    invitation_policy: invitationPolicy,
    resolveActorRole,
    reduce: async (input: RuntimeInput) => reduceInvitation(input, invitationPolicy),
  });
}

export function isExpeditionInvitationRuntime(
  value: RuntimeBundle,
): value is ExpeditionInvitationRuntime {
  const candidate = value as Partial<ExpeditionInvitationRuntime>;
  return candidate.invitation_policy !== undefined &&
    Number.isInteger(candidate.invitation_policy.team_size_min) &&
    Number.isInteger(candidate.invitation_policy.team_size_max) &&
    Number.isInteger(candidate.invitation_policy.invitation_ttl_hours);
}
