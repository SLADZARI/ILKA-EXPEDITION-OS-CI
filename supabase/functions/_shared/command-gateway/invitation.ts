import {
  type InvitationExecutionContext,
  type InvitationOperation,
  isExpeditionInvitationRuntime,
} from "../engine-runtime/expedition-invitations-v1.ts";
import type { InvitationDatabase } from "./invitation-database.ts";
import {
  createInvitationRequestValidator,
  type InvitationRequestValidator,
} from "./invitation-schema-validation.ts";
import type {
  AuthUser,
  CommandEnvelope,
  GatewayDatabase,
  GatewayExecutionContext,
  JsonValue,
  PreparedCommandResult,
  ProcessCommandResult,
  RuntimeRegistry,
  SchemaValidator,
  ValidationIssue,
} from "./types.ts";

export type InvitationCommandType =
  | "invite_participant"
  | "accept_invitation"
  | "revoke_invitation";

export interface InvitationExecutionRequest {
  command: CommandEnvelope;
  auth_user: AuthUser;
  request_hash: string;
}

export type InvitationExecutionOutcome =
  | { ok: true; result: ProcessCommandResult }
  | {
    ok: false;
    status: number;
    code: string;
    message: string;
    retryable: boolean;
    details?: ValidationIssue[];
  };

export interface InvitationExecutor {
  execute(request: InvitationExecutionRequest): Promise<InvitationExecutionOutcome>;
}

export interface InvitationExecutorDependencies {
  database: InvitationDatabase;
  contextDatabase: GatewayDatabase;
  schemas: SchemaValidator;
  runtimes: RuntimeRegistry;
  requestValidator?: InvitationRequestValidator;
  now(): Date;
  uuid(): string;
}

type JsonObject = Record<string, JsonValue>;

function failure(
  status: number,
  code: string,
  message: string,
  retryable = false,
  details?: ValidationIssue[],
): InvitationExecutionOutcome {
  return { ok: false, status, code, message, retryable, details };
}

function membershipActorId(membershipId: string): string {
  return `member_${membershipId.replaceAll("-", "")}`;
}

function canonicalInvitationId(invitationId: string): string {
  return `invitation_${invitationId.replaceAll("-", "")}`;
}

function canonicalParticipantId(participantId: string): string {
  return `participant_${participantId.replaceAll("-", "")}`;
}

function uuidFromCanonical(
  value: unknown,
  prefix: "invitation_" | "participant_",
): string | null {
  if (typeof value !== "string" || !value.startsWith(prefix)) return null;
  const hex = value.slice(prefix.length);
  if (!/^[a-f0-9]{32}$/.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${
    hex.slice(16, 20)
  }-${hex.slice(20)}`;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function emailHint(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return "***@invalid.test";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local.slice(0, 1)}***@${domain}`;
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

function canonicalSecretFreeCommand(
  command: CommandEnvelope,
  actorId: string,
  actorRole: "captain" | "participant",
): JsonObject {
  return {
    command_id: command.command_id,
    command_type: command.command_type,
    issued_at: command.issued_at,
    actor_id: actorId,
    actor_role: actorRole,
    expedition_id: command.expedition_id,
    idempotency_key: command.command_id,
    day_number: null,
    stage_id: null,
    day_revision: null,
    payload: {},
  };
}

function processRequest(
  command: CommandEnvelope,
  context: GatewayExecutionContext,
  actorId: string,
  actorRole: "captain" | "participant",
  requestHash: string,
  receivedAt: string,
  processedAt: string,
  prepared: PreparedCommandResult,
): JsonObject {
  const actor = context.actor;
  if (!actor) throw new Error("invitation_actor_context_required");
  return {
    expedition_id: context.expedition_id,
    command: canonicalSecretFreeCommand(command, actorId, actorRole),
    actor_context: {
      auth_user_id: actor.auth_user_id,
      profile_id: actor.profile_id,
      membership_id: actor.membership_id,
      participant_id: null,
      actor_id: actorId,
      actor_role: actorRole,
    },
    request_hash: requestHash,
    expected_stream_position: context.stream_position,
    status: prepared.status,
    events: prepared.events as unknown as JsonValue,
    projection_mutations: prepared.projection_mutations as unknown as JsonValue,
    runtime_release_id: context.runtime_release.id,
    reducer_version: context.runtime_release.reducer_version,
    received_at: receivedAt,
    processed_at: processedAt,
    rejection: prepared.rejection as unknown as JsonValue,
  };
}

function publicFailure(code: string): InvitationExecutionOutcome {
  const mappings: Record<string, {
    status: number;
    message: string;
    retryable?: boolean;
  }> = {
    active_profile_required: {
      status: 403,
      message: "An active authenticated Profile is required.",
    },
    profile_actor_mismatch: {
      status: 403,
      message: "The command Profile does not belong to the authenticated user.",
    },
    active_captain_membership_required: {
      status: 403,
      message: "An active Captain membership is required.",
    },
    actor_spoofing_detected: {
      status: 403,
      message: "The command actor does not match the authenticated actor.",
    },
    permission_denied: {
      status: 403,
      message: "The authenticated actor cannot submit this invitation command.",
    },
    expedition_not_found: {
      status: 404,
      message: "The Expedition does not exist.",
    },
    expedition_not_in_setup: {
      status: 409,
      message: "The Expedition is no longer accepting setup changes.",
    },
    expedition_setup_projection_missing: {
      status: 409,
      message: "The authoritative Expedition setup state is unavailable.",
    },
    projection_contract_mismatch: {
      status: 409,
      message: "The authoritative Expedition setup state has changed.",
    },
    team_capacity_reached: {
      status: 409,
      message: "The Expedition team has reached its maximum size.",
    },
    participant_already_member: {
      status: 409,
      message: "The authenticated Profile already belongs to this Expedition.",
    },
    pending_invitation_already_exists: {
      status: 409,
      message: "A pending invitation already exists for this participant.",
    },
    invitation_not_found: {
      status: 404,
      message: "The invitation could not be found.",
    },
    invitation_expired: {
      status: 410,
      message: "The invitation has expired.",
    },
    invitation_not_pending: {
      status: 409,
      message: "The invitation has already reached a terminal state.",
    },
    invitation_email_mismatch: {
      status: 403,
      message: "The authenticated email does not match the invitation.",
    },
    invitation_token_invalid: {
      status: 400,
      message: "The invitation token is invalid.",
    },
    participant_order_unavailable: {
      status: 409,
      message: "No Participant order is available.",
    },
    idempotency_key_reused_with_different_payload: {
      status: 409,
      message: "The command ID was already used for another request.",
    },
    receipt_actor_mismatch: {
      status: 403,
      message: "The stored command belongs to another authenticated actor.",
    },
    version_conflict: {
      status: 409,
      message: "The Expedition setup state changed before this command committed.",
    },
    runtime_release_unavailable: {
      status: 503,
      message: "The Expedition's pinned invitation runtime is unavailable.",
      retryable: true,
    },
  };
  const mapping = mappings[code];
  if (!mapping) {
    return failure(
      503,
      "invitation_persistence_unavailable",
      "The invitation command could not be committed.",
      true,
    );
  }
  return failure(
    mapping.status,
    code,
    mapping.message,
    mapping.retryable ?? false,
  );
}

function databaseFailure(error: unknown): InvitationExecutionOutcome {
  const message = error instanceof Error ? error.message : String(error);
  const stableCodes = [
    "active_profile_required",
    "profile_actor_mismatch",
    "active_captain_membership_required",
    "expedition_not_found",
    "expedition_not_in_setup",
    "team_capacity_reached",
    "participant_already_member",
    "pending_invitation_already_exists",
    "invitation_not_found",
    "invitation_expired",
    "invitation_not_pending",
    "invitation_email_mismatch",
    "invitation_token_invalid",
    "participant_order_unavailable",
    "idempotency_key_reused_with_different_payload",
    "receipt_actor_mismatch",
    "version_conflict",
  ];
  for (const code of stableCodes) {
    if (message.includes(code)) return publicFailure(code);
  }
  return publicFailure("invitation_persistence_unavailable");
}

function validatePrepared(
  prepared: PreparedCommandResult,
  schemas: SchemaValidator,
): ValidationIssue[] {
  const eventIssues = prepared.events.flatMap((event, index) =>
    schemas.validatePreparedEvent(event).map((issue) => ({
      path: `/events/${index}${issue.path === "/" ? "" : issue.path}`,
      message: issue.message,
    }))
  );
  const projectionIssues = prepared.projection_mutations.flatMap(
    (mutation, index) =>
      schemas.validateProjection(mutation.schema_id, mutation.projection).map(
        (issue) => ({
          path: `/projection_mutations/${index}/projection${
            issue.path === "/" ? "" : issue.path
          }`,
          message: issue.message,
        }),
      ),
  );
  return [...eventIssues, ...projectionIssues];
}

function validateActorForCaptain(
  command: CommandEnvelope,
  context: GatewayExecutionContext,
): InvitationExecutionOutcome | null {
  const actor = context.actor;
  if (
    !actor ||
    actor.membership_role !== "captain" ||
    actor.participant_id !== null ||
    actor.participant_key !== null
  ) {
    return publicFailure("active_captain_membership_required");
  }
  const actorId = membershipActorId(actor.membership_id);
  if (command.actor_id !== actorId || command.actor_role !== "captain") {
    return publicFailure("actor_spoofing_detected");
  }
  return null;
}

async function persist(
  database: InvitationDatabase,
  commandType: InvitationCommandType,
  request: JsonObject,
): Promise<ProcessCommandResult> {
  if (commandType === "invite_participant") {
    return await database.inviteParticipant(request);
  }
  if (commandType === "accept_invitation") {
    return await database.acceptInvitation(request);
  }
  return await database.revokeInvitation(request);
}

export function createInvitationExecutor(
  dependencies: InvitationExecutorDependencies,
): InvitationExecutor {
  const privateSchemas = dependencies.requestValidator ??
    createInvitationRequestValidator();

  return {
    async execute(
      request: InvitationExecutionRequest,
    ): Promise<InvitationExecutionOutcome> {
      const command = request.command;
      if (
        command.command_type !== "invite_participant" &&
        command.command_type !== "accept_invitation" &&
        command.command_type !== "revoke_invitation"
      ) {
        return failure(
          400,
          "validation_failed",
          "The invitation executor accepts only invitation commands.",
        );
      }
      const commandType = command.command_type as InvitationCommandType;

      let context: GatewayExecutionContext | null;
      try {
        context = await dependencies.contextDatabase.loadContext(
          command.expedition_id,
          request.auth_user.id,
        );
      } catch {
        return failure(
          503,
          "invitation_persistence_unavailable",
          "The Expedition setup state is temporarily unavailable.",
          true,
        );
      }
      if (!context) return publicFailure("expedition_not_found");

      const runtime = dependencies.runtimes.find(context.runtime_release);
      if (!runtime || !isExpeditionInvitationRuntime(runtime)) {
        return publicFailure("runtime_release_unavailable");
      }

      const receivedAt = dependencies.now().toISOString();
      let runtimeCommand = command;
      let runtimeContext: InvitationExecutionContext;
      let actorId: string;
      let actorRole: "captain" | "participant";
      let outerRequest: JsonObject;

      if (commandType === "accept_invitation") {
        if (command.actor_role !== "participant") {
          return publicFailure("permission_denied");
        }
        if (context.actor) return publicFailure("participant_already_member");
        if (
          !request.auth_user.email ||
          request.auth_user.email_verified !== true
        ) {
          return publicFailure("active_profile_required");
        }

        let profile;
        try {
          profile = await dependencies.database.loadActiveProfile(
            request.auth_user.id,
          );
        } catch {
          return failure(
            503,
            "invitation_persistence_unavailable",
            "The authenticated Profile could not be resolved.",
            true,
          );
        }
        if (!profile) return publicFailure("active_profile_required");
        if (command.actor_id !== profile.id) {
          return publicFailure("profile_actor_mismatch");
        }

        const token = command.payload.invitation_token;
        const displayNameValue = command.payload.display_name;
        if (
          typeof token !== "string" ||
          !/^[A-Za-z0-9_-]{43}$/.test(token)
        ) {
          return publicFailure("invitation_token_invalid");
        }
        if (typeof displayNameValue !== "string") {
          return failure(400, "validation_failed", "A display name is required.");
        }
        const displayName = displayNameValue.trim();
        if (displayName.length === 0 || displayName.length > 200) {
          return failure(
            400,
            "validation_failed",
            "The display name must contain between 1 and 200 characters.",
          );
        }

        const tokenHash = await sha256Hex(token);
        let candidate;
        try {
          candidate = await dependencies.database.loadAcceptanceCandidate(
            context.expedition_id,
            tokenHash,
          );
        } catch {
          return failure(
            503,
            "invitation_persistence_unavailable",
            "The invitation could not be resolved.",
            true,
          );
        }
        if (!candidate) return publicFailure("invitation_not_found");
        if (candidate.status !== "pending") {
          return publicFailure("invitation_not_pending");
        }
        if (candidate.role !== "participant") {
          return publicFailure("invitation_not_found");
        }
        if (new Date(candidate.expires_at).getTime() <= dependencies.now().getTime()) {
          return publicFailure("invitation_expired");
        }
        const authEmail = normalizeEmail(request.auth_user.email);
        if (authEmail !== candidate.email_normalized) {
          return publicFailure("invitation_email_mismatch");
        }
        if (candidate.participant_order === null) {
          return publicFailure("participant_order_unavailable");
        }

        const membershipId = dependencies.uuid();
        const participantUuid = dependencies.uuid();
        const participantId = canonicalParticipantId(participantUuid);
        actorId = membershipActorId(membershipId);
        actorRole = "participant";
        const operation: InvitationOperation = {
          kind: "accept",
          invitation_id: canonicalInvitationId(candidate.invitation_id),
          participant_id: participantId,
          display_name: displayName,
          participant_order: candidate.participant_order,
        };
        runtimeCommand = {
          ...command,
          actor_id: actorId,
          actor_role: actorRole,
          day_number: null,
          stage_id: null,
          day_revision: null,
        };
        runtimeContext = {
          ...context,
          actor: {
            auth_user_id: request.auth_user.id,
            profile_id: profile.id,
            membership_id: membershipId,
            participant_id: null,
            participant_key: null,
            membership_role: "participant",
          },
          invitation_operation: operation,
        };

        let prepared: PreparedCommandResult;
        try {
          prepared = await runtime.reduce({
            command: runtimeCommand,
            actor_id: actorId,
            actor_role: actorRole,
            context: runtimeContext,
            received_at: receivedAt,
          });
        } catch {
          return failure(
            500,
            "runtime_execution_failed",
            "The pinned invitation runtime failed to process the command.",
            true,
          );
        }
        if (prepared.status !== "accepted") {
          return publicFailure(
            prepared.rejection?.code ?? "invitation_persistence_unavailable",
          );
        }
        const preparedIssues = validatePrepared(prepared, dependencies.schemas);
        if (preparedIssues.length) {
          return failure(
            500,
            "runtime_contract_invalid",
            "The invitation runtime produced invalid authoritative output.",
            false,
            preparedIssues,
          );
        }

        const processedAt = dependencies.now().toISOString();
        const nested = processRequest(
          runtimeCommand,
          runtimeContext,
          actorId,
          actorRole,
          request.request_hash,
          receivedAt,
          processedAt,
          prepared,
        );
        outerRequest = {
          auth_identity: {
            auth_user_id: request.auth_user.id,
            profile_id: profile.id,
            email_normalized: authEmail,
            email_verified: true,
            profile_status: "active",
          },
          invitation_match: {
            invitation_id: candidate.invitation_id,
            expedition_id: context.expedition_id,
            token_hash: tokenHash,
            email_normalized: authEmail,
            expected_status: "pending",
          },
          participant_membership: {
            id: membershipId,
            expedition_id: context.expedition_id,
            profile_id: profile.id,
            role: "participant",
            status: "active",
          },
          participant: {
            id: participantUuid,
            expedition_id: context.expedition_id,
            expedition_member_id: membershipId,
            participant_key: participantId,
            participant_order: candidate.participant_order,
            display_name: displayName,
            status: "active",
          },
          process_command_request: nested,
        };
        const privateIssues = privateSchemas.validateAccept(outerRequest);
        if (privateIssues.length) {
          return failure(
            500,
            "runtime_contract_invalid",
            "The prepared invitation acceptance request is invalid.",
            false,
            privateIssues,
          );
        }
      } else {
        const actorFailure = validateActorForCaptain(command, context);
        if (actorFailure) return actorFailure;
        const actor = context.actor!;
        actorId = membershipActorId(actor.membership_id);
        actorRole = "captain";

        let operation: InvitationOperation;
        let structural: JsonObject;
        if (commandType === "invite_participant") {
          const emailValue = command.payload.email;
          const token = command.payload.invitation_token;
          if (typeof emailValue !== "string") {
            return failure(
              400,
              "validation_failed",
              "An invitation email is required.",
            );
          }
          if (
            typeof token !== "string" ||
            !/^[A-Za-z0-9_-]{43}$/.test(token)
          ) {
            return publicFailure("invitation_token_invalid");
          }
          const email = normalizeEmail(emailValue);
          if (email.length < 3 || email.length > 254 || !email.includes("@")) {
            return failure(
              400,
              "validation_failed",
              "The invitation email is invalid.",
            );
          }
          const tokenHash = await sha256Hex(token);
          const invitationUuid = dependencies.uuid();
          const expiresAt = new Date(
            new Date(receivedAt).getTime() +
              runtime.invitation_policy.invitation_ttl_hours * 60 * 60 * 1000,
          ).toISOString();
          operation = {
            kind: "invite",
            invitation_id: canonicalInvitationId(invitationUuid),
            email_hint: emailHint(email),
            expires_at: expiresAt,
          };
          structural = {
            id: invitationUuid,
            expedition_id: context.expedition_id,
            email_normalized: email,
            role: "participant",
            token_hash: tokenHash,
            invited_by_membership_id: actor.membership_id,
            expires_at: expiresAt,
          };
        } else {
          const invitationUuid = uuidFromCanonical(
            command.payload.invitation_id,
            "invitation_",
          );
          const reasonValue = command.payload.reason;
          if (!invitationUuid) return publicFailure("invitation_not_found");
          if (typeof reasonValue !== "string") {
            return failure(
              400,
              "validation_failed",
              "A revocation reason is required.",
            );
          }
          const reason = reasonValue.trim();
          if (reason.length === 0 || reason.length > 2000) {
            return failure(
              400,
              "validation_failed",
              "The revocation reason must contain between 1 and 2000 characters.",
            );
          }
          operation = {
            kind: "revoke",
            invitation_id: command.payload.invitation_id as string,
            reason,
          };
          structural = {
            invitation_id: invitationUuid,
            expedition_id: context.expedition_id,
            expected_status: "pending",
            revoked_by_profile_id: actor.profile_id,
            reason,
          };
        }

        runtimeContext = {
          ...context,
          invitation_operation: operation,
        };
        let prepared: PreparedCommandResult;
        try {
          prepared = await runtime.reduce({
            command: {
              ...command,
              day_number: null,
              stage_id: null,
              day_revision: null,
            },
            actor_id: actorId,
            actor_role: actorRole,
            context: runtimeContext,
            received_at: receivedAt,
          });
        } catch {
          return failure(
            500,
            "runtime_execution_failed",
            "The pinned invitation runtime failed to process the command.",
            true,
          );
        }
        if (prepared.status !== "accepted") {
          return publicFailure(
            prepared.rejection?.code ?? "invitation_persistence_unavailable",
          );
        }
        const preparedIssues = validatePrepared(prepared, dependencies.schemas);
        if (preparedIssues.length) {
          return failure(
            500,
            "runtime_contract_invalid",
            "The invitation runtime produced invalid authoritative output.",
            false,
            preparedIssues,
          );
        }

        const processedAt = dependencies.now().toISOString();
        const nested = processRequest(
          command,
          runtimeContext,
          actorId,
          actorRole,
          request.request_hash,
          receivedAt,
          processedAt,
          prepared,
        );
        outerRequest = commandType === "invite_participant"
          ? { invitation: structural, process_command_request: nested }
          : { invitation_transition: structural, process_command_request: nested };
        const privateIssues = commandType === "invite_participant"
          ? privateSchemas.validateInvite(outerRequest)
          : privateSchemas.validateRevoke(outerRequest);
        if (privateIssues.length) {
          return failure(
            500,
            "runtime_contract_invalid",
            "The prepared invitation transaction request is invalid.",
            false,
            privateIssues,
          );
        }
      }

      let result: ProcessCommandResult;
      try {
        result = await persist(dependencies.database, commandType, outerRequest);
      } catch (error) {
        return databaseFailure(error);
      }

      const resultIssues = dependencies.schemas.validateProcessResult(result);
      if (resultIssues.length) {
        return failure(
          500,
          "persistence_contract_invalid",
          "The invitation transaction returned an invalid result.",
          false,
          resultIssues,
        );
      }
      return { ok: true, result };
    },
  };
}
