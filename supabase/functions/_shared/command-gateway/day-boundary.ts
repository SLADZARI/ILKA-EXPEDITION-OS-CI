import {
  isDay1BoundaryRuntime,
  type SystemExecutionContext,
} from "../engine-runtime/day1-boundary-v1.ts";
import type { DayBoundaryDatabase } from "./day-boundary-database.ts";
import {
  createDayBoundaryRequestValidator,
  type DayBoundaryRequestValidator,
} from "./day-boundary-schema-validation.ts";
import type {
  CommandEnvelope,
  JsonValue,
  PreparedCommandResult,
  ProcessCommandResult,
  RuntimeRegistry,
  SchemaValidator,
  ValidationIssue,
} from "./types.ts";

export interface DayBoundaryExecutionRequest {
  command: CommandEnvelope;
  request_hash: string;
}

export type DayBoundaryExecutionOutcome =
  | { ok: true; result: ProcessCommandResult }
  | {
    ok: false;
    status: number;
    code: string;
    message: string;
    retryable: boolean;
    details?: ValidationIssue[];
  };

export interface DayBoundaryExecutor {
  execute(
    request: DayBoundaryExecutionRequest,
  ): Promise<DayBoundaryExecutionOutcome>;
}

export interface DayBoundaryExecutorDependencies {
  database: DayBoundaryDatabase;
  schemas: SchemaValidator;
  runtimes: RuntimeRegistry;
  requestValidator?: DayBoundaryRequestValidator;
  now(): Date;
}

type JsonObject = Record<string, JsonValue>;

function failure(
  status: number,
  code: string,
  message: string,
  retryable = false,
  details?: ValidationIssue[],
): DayBoundaryExecutionOutcome {
  return { ok: false, status, code, message, retryable, details };
}

function publicFailure(code: string): DayBoundaryExecutionOutcome {
  const mappings: Record<string, {
    status: number;
    message: string;
    retryable?: boolean;
  }> = {
    expedition_not_found: {
      status: 404,
      message: "The Expedition does not exist.",
    },
    system_actor_not_allowed: {
      status: 403,
      message: "Only trusted system_clock may process the Day boundary.",
    },
    expedition_not_active: {
      status: 409,
      message: "The Expedition is not active.",
    },
    stage_not_open: {
      status: 409,
      message: "The onboarding Stage is not active.",
    },
    local_boundary_not_reached: {
      status: 409,
      message: "The local Day boundary has not been reached.",
    },
    boundary_date_mismatch: {
      status: 409,
      message: "The Day boundary does not match the Expedition local date.",
    },
    boundary_already_processed: {
      status: 409,
      message: "The Day boundary was already processed.",
    },
    active_day_already_exists: {
      status: 409,
      message: "An authoritative Calendar Day already exists.",
    },
    scheduled_assignments_unresolvable: {
      status: 409,
      message: "The Day 1 assignments cannot be resolved.",
    },
    card_bundle_unresolvable: {
      status: 409,
      message: "The Day 1 Card Bundles cannot be resolved.",
    },
    idempotency_key_reused_with_different_payload: {
      status: 409,
      message: "The command ID was already used for another request.",
    },
    receipt_actor_mismatch: {
      status: 403,
      message: "The stored command belongs to another actor.",
    },
    version_conflict: {
      status: 409,
      message: "The Expedition changed before the Day boundary committed.",
    },
    runtime_release_unavailable: {
      status: 503,
      message: "The Expedition's pinned Day 1 runtime is unavailable.",
      retryable: true,
    },
  };
  const mapping = mappings[code];
  if (!mapping) {
    return failure(
      503,
      "day_boundary_persistence_unavailable",
      "The Day boundary could not be processed.",
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

function databaseFailure(error: unknown): DayBoundaryExecutionOutcome {
  const message = error instanceof Error ? error.message : String(error);
  const stableCodes = [
    "expedition_not_found",
    "system_actor_not_allowed",
    "expedition_not_active",
    "stage_not_open",
    "local_boundary_not_reached",
    "boundary_date_mismatch",
    "boundary_already_processed",
    "active_day_already_exists",
    "scheduled_assignments_unresolvable",
    "card_bundle_unresolvable",
    "idempotency_key_reused_with_different_payload",
    "receipt_actor_mismatch",
    "version_conflict",
  ];
  for (const code of stableCodes) {
    if (message.includes(code)) return publicFailure(code);
  }
  return publicFailure("day_boundary_persistence_unavailable");
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

function activeSetup(context: SystemExecutionContext): {
  rotation_id: string;
  rules_version: number;
  participant_keys: string[];
} | null {
  const document = context.projections.find((candidate) =>
    candidate.projection_key === "expedition_setup_view"
  );
  if (!document) return null;
  const projection = document.projection;
  const rotation = projection.rotation;
  const participants = projection.participants;
  if (
    !rotation || typeof rotation !== "object" || Array.isArray(rotation) ||
    !Array.isArray(participants)
  ) return null;
  const record = rotation as JsonObject;
  const rotationId = record.rotation_id;
  const rulesVersion = record.rules_version;
  const participantKeys = participants.flatMap((participant) => {
    if (
      !participant || typeof participant !== "object" || Array.isArray(participant)
    ) return [];
    const item = participant as JsonObject;
    return item.status === "active" && typeof item.participant_id === "string"
      ? [item.participant_id]
      : [];
  });
  if (
    typeof rotationId !== "string" ||
    typeof rulesVersion !== "number" || !Number.isInteger(rulesVersion) ||
    participantKeys.length < 3 || participantKeys.length > 5
  ) return null;
  return {
    rotation_id: rotationId,
    rules_version: rulesVersion,
    participant_keys: participantKeys,
  };
}

function processRequest(
  command: CommandEnvelope,
  context: SystemExecutionContext,
  requestHash: string,
  receivedAt: string,
  processedAt: string,
  prepared: PreparedCommandResult,
): JsonObject {
  return {
    expedition_id: context.expedition_id,
    command: {
      ...command,
      actor_id: "system_clock",
      actor_role: "system_clock",
      day_number: null,
      stage_id: null,
      day_revision: null,
      device_id: null,
    } as unknown as JsonValue,
    actor_context: {
      auth_user_id: null,
      profile_id: null,
      membership_id: null,
      participant_id: null,
      actor_id: "system_clock",
      actor_role: "system_clock",
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

export function createDayBoundaryExecutor(
  dependencies: DayBoundaryExecutorDependencies,
): DayBoundaryExecutor {
  const requestValidator = dependencies.requestValidator ??
    createDayBoundaryRequestValidator();

  return {
    async execute(
      request: DayBoundaryExecutionRequest,
    ): Promise<DayBoundaryExecutionOutcome> {
      const command = request.command;
      if (
        command.command_type !== "process_day_boundary" ||
        command.actor_id !== "system_clock" ||
        command.actor_role !== "system_clock"
      ) return publicFailure("system_actor_not_allowed");

      let context: SystemExecutionContext | null;
      try {
        context = await dependencies.database.loadSystemContext(
          command.expedition_id,
        );
      } catch {
        return failure(
          503,
          "day_boundary_persistence_unavailable",
          "The Expedition state is temporarily unavailable.",
          true,
        );
      }
      if (!context) return publicFailure("expedition_not_found");

      const runtime = dependencies.runtimes.find(context.runtime_release);
      if (!runtime || !isDay1BoundaryRuntime(runtime)) {
        return publicFailure("runtime_release_unavailable");
      }

      const receivedAt = dependencies.now().toISOString();
      let prepared: PreparedCommandResult;
      try {
        prepared = await runtime.reduceBoundary({
          command,
          actor_id: "system_clock",
          actor_role: "system_clock",
          context,
          received_at: receivedAt,
        });
      } catch {
        return failure(
          500,
          "runtime_execution_failed",
          "The pinned Day 1 runtime failed to process the boundary.",
          true,
        );
      }
      if (prepared.status !== "accepted") {
        return publicFailure(
          prepared.rejection?.code ?? "day_boundary_persistence_unavailable",
        );
      }

      const preparedIssues = validatePrepared(prepared, dependencies.schemas);
      if (preparedIssues.length) {
        return failure(
          500,
          "runtime_contract_invalid",
          "The Day 1 runtime produced invalid authoritative output.",
          false,
          preparedIssues,
        );
      }
      if (
        prepared.events.length !== 3 ||
        prepared.events[0].event_type !== "day.started" ||
        prepared.events[1].event_type !== "role_assignments.activated" ||
        prepared.events[2].event_type !== "card_bundles.published"
      ) {
        return failure(
          500,
          "runtime_contract_invalid",
          "The Day 1 runtime produced an invalid event sequence.",
        );
      }

      const setup = activeSetup(context);
      if (!setup) return publicFailure("scheduled_assignments_unresolvable");
      if (prepared.projection_mutations.length !== setup.participant_keys.length + 1) {
        return failure(
          500,
          "runtime_contract_invalid",
          "The Day 1 runtime produced an invalid projection set.",
        );
      }

      const payload = command.payload;
      const boundaryAt = payload.boundary_at;
      const localDate = payload.local_calendar_date;
      if (typeof boundaryAt !== "string" || typeof localDate !== "string") {
        return failure(
          400,
          "validation_failed",
          "The Day boundary payload is invalid.",
        );
      }
      const processedAt = dependencies.now().toISOString();
      const outerRequest: JsonObject = {
        boundary_transition: {
          expedition_id: context.expedition_id,
          local_calendar_date: localDate,
          boundary_at: boundaryAt,
          day_number: 1,
          day_revision: 1,
          stage_id: "onboarding",
          rotation_id: setup.rotation_id,
          rules_version: setup.rules_version,
          participant_keys: setup.participant_keys,
        },
        process_command_request: processRequest(
          command,
          context,
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
          "The prepared Day boundary transaction request is invalid.",
          false,
          requestIssues,
        );
      }

      let result: ProcessCommandResult;
      try {
        result = await dependencies.database.processDayBoundary(outerRequest);
      } catch (error) {
        return databaseFailure(error);
      }
      const resultIssues = dependencies.schemas.validateProcessResult(result);
      if (resultIssues.length) {
        return failure(
          500,
          "persistence_contract_invalid",
          "The Day boundary transaction returned an invalid result.",
          false,
          resultIssues,
        );
      }
      return { ok: true, result };
    },
  };
}
