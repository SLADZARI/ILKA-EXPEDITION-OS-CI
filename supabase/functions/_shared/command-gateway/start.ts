import { isExpeditionStartRuntime } from "../engine-runtime/expedition-start-v1.ts";
import type { StartDatabase } from "./start-database.ts";
import {
  createStartRequestValidator,
  type StartRequestValidator,
} from "./start-schema-validation.ts";
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

export interface StartExecutionRequest {
  command: CommandEnvelope;
  auth_user: AuthUser;
  request_hash: string;
}

export type StartExecutionOutcome =
  | { ok: true; result: ProcessCommandResult }
  | {
    ok: false;
    status: number;
    code: string;
    message: string;
    retryable: boolean;
    details?: ValidationIssue[];
  };

export interface StartExecutor {
  execute(request: StartExecutionRequest): Promise<StartExecutionOutcome>;
}

export interface StartExecutorDependencies {
  database: StartDatabase;
  contextDatabase: GatewayDatabase;
  schemas: SchemaValidator;
  runtimes: RuntimeRegistry;
  requestValidator?: StartRequestValidator;
  now(): Date;
}

type JsonObject = Record<string, JsonValue>;

function failure(
  status: number,
  code: string,
  message: string,
  retryable = false,
  details?: ValidationIssue[],
): StartExecutionOutcome {
  return { ok: false, status, code, message, retryable, details };
}

function membershipActorId(membershipId: string): string {
  return `member_${membershipId.replaceAll("-", "")}`;
}

function publicFailure(code: string): StartExecutionOutcome {
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
      message: "Only the active Captain may start the Expedition.",
    },
    expedition_not_found: {
      status: 404,
      message: "The Expedition does not exist.",
    },
    expedition_not_ready: {
      status: 409,
      message: "The Expedition is not ready to start.",
    },
    expedition_already_started: {
      status: 409,
      message: "The Expedition has already started.",
    },
    expedition_setup_projection_missing: {
      status: 409,
      message: "The authoritative Expedition setup state is unavailable.",
    },
    projection_contract_mismatch: {
      status: 409,
      message: "The authoritative Expedition setup state has changed.",
    },
    team_not_frozen: {
      status: 409,
      message: "The ready team is not frozen or complete.",
    },
    rotation_not_ready: {
      status: 409,
      message: "The generated Rotation Plan is unavailable or incompatible.",
    },
    first_stage_unresolvable: {
      status: 409,
      message: "The first Product Stage cannot be resolved.",
    },
    calendar_day_already_exists: {
      status: 409,
      message: "A Calendar Day already exists for the Expedition.",
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
      message: "The Expedition setup state changed before start committed.",
    },
    runtime_release_unavailable: {
      status: 503,
      message: "The Expedition's pinned start runtime is unavailable.",
      retryable: true,
    },
  };
  const mapping = mappings[code];
  if (!mapping) {
    return failure(
      503,
      "start_persistence_unavailable",
      "The Expedition could not be started.",
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

function databaseFailure(error: unknown): StartExecutionOutcome {
  const message = error instanceof Error ? error.message : String(error);
  const stableCodes = [
    "active_captain_membership_required",
    "actor_spoofing_detected",
    "permission_denied",
    "expedition_not_found",
    "expedition_not_ready",
    "expedition_already_started",
    "expedition_setup_projection_missing",
    "team_not_frozen",
    "rotation_not_ready",
    "first_stage_unresolvable",
    "calendar_day_already_exists",
    "idempotency_key_reused_with_different_payload",
    "receipt_actor_mismatch",
    "version_conflict",
  ];
  for (const code of stableCodes) {
    if (message.includes(code)) return publicFailure(code);
  }
  return publicFailure("start_persistence_unavailable");
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
  if (!actor) throw new Error("start_actor_context_required");
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

export function createStartExecutor(
  dependencies: StartExecutorDependencies,
): StartExecutor {
  const requestValidator = dependencies.requestValidator ??
    createStartRequestValidator();

  return {
    async execute(request: StartExecutionRequest): Promise<StartExecutionOutcome> {
      const command = request.command;
      if (command.command_type !== "start_expedition") {
        return failure(
          400,
          "validation_failed",
          "The start executor accepts only start_expedition.",
        );
      }
      if (
        command.actor_role !== "captain" ||
        Object.keys(command.payload).length !== 0 ||
        command.day_number != null || command.stage_id != null ||
        command.day_revision != null
      ) {
        return failure(
          400,
          "validation_failed",
          "start_expedition requires Captain actor, empty payload and null Day/Stage context.",
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
          "start_persistence_unavailable",
          "The Expedition setup state is temporarily unavailable.",
          true,
        );
      }
      if (!context) return publicFailure("expedition_not_found");

      const actor = context.actor;
      if (
        !actor || actor.membership_role !== "captain" ||
        actor.participant_id !== null || actor.participant_key !== null
      ) return publicFailure("active_captain_membership_required");
      const actorId = membershipActorId(actor.membership_id);
      if (command.actor_id !== actorId) return publicFailure("actor_spoofing_detected");

      const runtime = dependencies.runtimes.find(context.runtime_release);
      if (!runtime || !isExpeditionStartRuntime(runtime)) {
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
          "The pinned start runtime failed to process the command.",
          true,
        );
      }
      if (prepared.status !== "accepted") {
        return publicFailure(
          prepared.rejection?.code ?? "start_persistence_unavailable",
        );
      }

      const preparedIssues = validatePrepared(prepared, dependencies.schemas);
      if (preparedIssues.length) {
        return failure(
          500,
          "runtime_contract_invalid",
          "The start runtime produced invalid authoritative output.",
          false,
          preparedIssues,
        );
      }
      if (
        prepared.events.length !== 2 ||
        prepared.events[0].event_type !== "expedition.started" ||
        prepared.events[1].event_type !== "stage.opened" ||
        prepared.projection_mutations.length !== 1
      ) {
        return failure(
          500,
          "runtime_contract_invalid",
          "The start runtime produced an invalid event or projection sequence.",
        );
      }

      const projection = prepared.projection_mutations[0].projection;
      const rotation = projection.rotation;
      if (
        typeof rotation !== "object" || rotation === null || Array.isArray(rotation)
      ) {
        return failure(
          500,
          "runtime_contract_invalid",
          "The start rotation is invalid.",
        );
      }
      const rotationRecord = rotation as JsonObject;
      const rotationId = rotationRecord.rotation_id;
      const rulesVersion = rotationRecord.rules_version;
      if (
        typeof rotationId !== "string" ||
        !/^rotation_[a-f0-9]{32}$/.test(rotationId) ||
        typeof rulesVersion !== "number" || !Number.isInteger(rulesVersion)
      ) {
        return failure(
          500,
          "runtime_contract_invalid",
          "The start rotation identity or rules version is invalid.",
        );
      }

      const processedAt = dependencies.now().toISOString();
      const outerRequest: JsonObject = {
        expedition_transition: {
          expedition_id: context.expedition_id,
          expected_status: "ready",
          next_status: "active",
          stage_id: runtime.start_policy.first_stage_id,
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
          "The prepared start transaction request is invalid.",
          false,
          requestIssues,
        );
      }

      let result: ProcessCommandResult;
      try {
        result = await dependencies.database.startExpedition(outerRequest);
      } catch (error) {
        return databaseFailure(error);
      }
      const resultIssues = dependencies.schemas.validateProcessResult(result);
      if (resultIssues.length) {
        return failure(
          500,
          "persistence_contract_invalid",
          "The start transaction returned an invalid result.",
          false,
          resultIssues,
        );
      }
      return { ok: true, result };
    },
  };
}
