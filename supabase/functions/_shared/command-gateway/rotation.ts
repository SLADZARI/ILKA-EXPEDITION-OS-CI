import { isExpeditionRotationRuntime } from "../engine-runtime/expedition-rotation-v1.ts";
import type { RotationDatabase } from "./rotation-database.ts";
import {
  createRotationRequestValidator,
  type RotationRequestValidator,
} from "./rotation-schema-validation.ts";
import type {
  AuthUser,
  CommandEnvelope,
  GatewayDatabase,
  JsonValue,
  PreparedCommandResult,
  ProcessCommandResult,
  RuntimeRegistry,
  SchemaValidator,
  ValidationIssue,
} from "./types.ts";

export interface RotationExecutionRequest {
  command: CommandEnvelope;
  auth_user: AuthUser;
  request_hash: string;
}

export type RotationExecutionOutcome =
  | { ok: true; result: ProcessCommandResult }
  | {
    ok: false;
    status: number;
    code: string;
    message: string;
    retryable: boolean;
    details?: ValidationIssue[];
  };

export interface RotationExecutor {
  execute(request: RotationExecutionRequest): Promise<RotationExecutionOutcome>;
}

export interface RotationExecutorDependencies {
  database: RotationDatabase;
  contextDatabase: GatewayDatabase;
  schemas: SchemaValidator;
  runtimes: RuntimeRegistry;
  requestValidator?: RotationRequestValidator;
  now(): Date;
}

type JsonObject = Record<string, JsonValue>;

function failure(
  status: number,
  code: string,
  message: string,
  retryable = false,
  details?: ValidationIssue[],
): RotationExecutionOutcome {
  return { ok: false, status, code, message, retryable, details };
}

function membershipActorId(membershipId: string): string {
  return `member_${membershipId.replaceAll("-", "")}`;
}

function publicFailure(code: string): RotationExecutionOutcome {
  const mappings: Record<string, {
    status: number;
    message: string;
    retryable?: boolean;
  }> = {
    active_captain_membership_required: {
      status: 403,
      message: "An active Captain membership is required.",
    },
    actor_spoofing_detected: {
      status: 403,
      message: "The command actor does not match the authenticated Captain.",
    },
    permission_denied: {
      status: 403,
      message: "Only the active Captain may generate the Rotation Plan.",
    },
    expedition_not_found: {
      status: 404,
      message: "The Expedition does not exist.",
    },
    expedition_not_in_setup: {
      status: 409,
      message: "The Expedition is no longer in draft setup.",
    },
    expedition_setup_projection_missing: {
      status: 409,
      message: "The authoritative Expedition setup state is unavailable.",
    },
    projection_contract_mismatch: {
      status: 409,
      message: "The authoritative Expedition setup state has changed.",
    },
    rotation_not_ready: {
      status: 409,
      message: "The Expedition team is not ready for rotation generation.",
    },
    pending_invitations_exist: {
      status: 409,
      message: "All pending invitations must reach a terminal state first.",
    },
    participant_order_unavailable: {
      status: 409,
      message: "The active Participant order is incomplete or invalid.",
    },
    rotation_already_generated: {
      status: 409,
      message: "The initial Rotation Plan has already been generated.",
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
      message: "The Expedition setup state changed before rotation committed.",
    },
    runtime_release_unavailable: {
      status: 503,
      message: "The Expedition's pinned rotation runtime is unavailable.",
      retryable: true,
    },
  };
  const mapping = mappings[code];
  if (!mapping) {
    return failure(
      503,
      "rotation_persistence_unavailable",
      "The Rotation Plan could not be committed.",
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

function databaseFailure(error: unknown): RotationExecutionOutcome {
  const message = error instanceof Error ? error.message : String(error);
  const stableCodes = [
    "active_captain_membership_required",
    "actor_spoofing_detected",
    "permission_denied",
    "expedition_not_found",
    "expedition_not_in_setup",
    "rotation_not_ready",
    "pending_invitations_exist",
    "participant_order_unavailable",
    "rotation_already_generated",
    "idempotency_key_reused_with_different_payload",
    "receipt_actor_mismatch",
    "version_conflict",
  ];
  for (const code of stableCodes) {
    if (message.includes(code)) return publicFailure(code);
  }
  return publicFailure("rotation_persistence_unavailable");
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

function processRequest(
  command: CommandEnvelope,
  context: NonNullable<Awaited<ReturnType<GatewayDatabase["loadContext"]>>>,
  actorId: string,
  requestHash: string,
  receivedAt: string,
  processedAt: string,
  prepared: PreparedCommandResult,
): JsonObject {
  const actor = context.actor;
  if (!actor) throw new Error("rotation_actor_context_required");
  return {
    expedition_id: context.expedition_id,
    command: {
      ...command,
      actor_id: actorId,
      actor_role: "captain",
      day_number: null,
      stage_id: null,
      day_revision: null,
      payload: {},
    } as unknown as JsonValue,
    actor_context: {
      auth_user_id: actor.auth_user_id,
      profile_id: actor.profile_id,
      membership_id: actor.membership_id,
      participant_id: null,
      actor_id: actorId,
      actor_role: "captain",
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

export function createRotationExecutor(
  dependencies: RotationExecutorDependencies,
): RotationExecutor {
  const requestValidator = dependencies.requestValidator ??
    createRotationRequestValidator();

  return {
    async execute(
      request: RotationExecutionRequest,
    ): Promise<RotationExecutionOutcome> {
      const command = request.command;
      if (command.command_type !== "generate_rotation") {
        return failure(
          400,
          "validation_failed",
          "The rotation executor accepts only generate_rotation.",
        );
      }
      if (
        command.actor_role !== "captain" ||
        Object.keys(command.payload).length !== 0 ||
        command.day_number != null ||
        command.stage_id != null ||
        command.day_revision != null
      ) {
        return failure(
          400,
          "validation_failed",
          "generate_rotation requires Captain actor, empty payload and null setup context.",
        );
      }

      let context;
      try {
        context = await dependencies.contextDatabase.loadContext(
          command.expedition_id,
          request.auth_user.id,
        );
      } catch {
        return failure(
          503,
          "rotation_persistence_unavailable",
          "The Expedition setup state is temporarily unavailable.",
          true,
        );
      }
      if (!context) return publicFailure("expedition_not_found");

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
      if (command.actor_id !== actorId) {
        return publicFailure("actor_spoofing_detected");
      }

      const runtime = dependencies.runtimes.find(context.runtime_release);
      if (!runtime || !isExpeditionRotationRuntime(runtime)) {
        return publicFailure("runtime_release_unavailable");
      }

      const receivedAt = dependencies.now().toISOString();
      let prepared: PreparedCommandResult;
      try {
        prepared = await runtime.reduce({
          command: {
            ...command,
            actor_id: actorId,
            actor_role: "captain",
            day_number: null,
            stage_id: null,
            day_revision: null,
            payload: {},
          },
          actor_id: actorId,
          actor_role: "captain",
          context,
          received_at: receivedAt,
        });
      } catch {
        return failure(
          500,
          "runtime_execution_failed",
          "The pinned rotation runtime failed to process the command.",
          true,
        );
      }
      if (prepared.status !== "accepted") {
        return publicFailure(
          prepared.rejection?.code ?? "rotation_persistence_unavailable",
        );
      }

      const preparedIssues = validatePrepared(prepared, dependencies.schemas);
      if (preparedIssues.length) {
        return failure(
          500,
          "runtime_contract_invalid",
          "The rotation runtime produced invalid authoritative output.",
          false,
          preparedIssues,
        );
      }
      if (
        prepared.events.length !== 2 ||
        prepared.events[0].event_type !== "rotation.generated" ||
        prepared.events[1].event_type !== "expedition.ready"
      ) {
        return failure(
          500,
          "runtime_contract_invalid",
          "The rotation runtime produced an invalid event sequence.",
        );
      }

      const generatedPayload = prepared.events[0].payload;
      if (
        typeof generatedPayload !== "object" ||
        generatedPayload === null ||
        Array.isArray(generatedPayload)
      ) {
        return failure(
          500,
          "runtime_contract_invalid",
          "The rotation event payload is invalid.",
        );
      }
      const rotationId = generatedPayload.rotation_id;
      const rulesVersion = generatedPayload.rules_version;
      if (
        typeof rotationId !== "string" ||
        !/^rotation_[a-f0-9]{32}$/.test(rotationId) ||
        typeof rulesVersion !== "number" ||
        !Number.isInteger(rulesVersion)
      ) {
        return failure(
          500,
          "runtime_contract_invalid",
          "The rotation identity or rules version is invalid.",
        );
      }

      const processedAt = dependencies.now().toISOString();
      const outerRequest: JsonObject = {
        expedition_transition: {
          expedition_id: context.expedition_id,
          expected_status: "draft",
          next_status: "ready",
          rotation_id: rotationId,
          rules_version: rulesVersion,
        },
        process_command_request: processRequest(
          command,
          context,
          actorId,
          request.request_hash,
          receivedAt,
          processedAt,
          prepared,
        ),
      };
      const requestIssues = requestValidator.validate(outerRequest);
      if (requestIssues.length) {
        return failure(
          500,
          "runtime_contract_invalid",
          "The prepared rotation transaction request is invalid.",
          false,
          requestIssues,
        );
      }

      let result: ProcessCommandResult;
      try {
        result = await dependencies.database.generateRotation(outerRequest);
      } catch (error) {
        return databaseFailure(error);
      }

      const resultIssues = dependencies.schemas.validateProcessResult(result);
      if (resultIssues.length) {
        return failure(
          500,
          "persistence_contract_invalid",
          "The rotation transaction returned an invalid result.",
          false,
          resultIssues,
        );
      }
      return { ok: true, result };
    },
  };
}
