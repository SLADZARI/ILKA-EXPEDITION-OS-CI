import {
  isExpeditionBootstrapRuntime,
} from "../engine-runtime/expedition-bootstrap-v1.ts";
import { createBootstrapRequestValidator } from "./bootstrap-schema-validation.ts";
import type { BootstrapDatabase } from "./bootstrap-database.ts";
import type {
  AuthUser,
  CommandEnvelope,
  GatewayExecutionContext,
  JsonValue,
  ProcessCommandResult,
  RuntimeRegistry,
  SchemaValidator,
  ValidationIssue,
} from "./types.ts";

export interface BootstrapExecutionRequest {
  command: CommandEnvelope;
  auth_user: AuthUser;
  request_hash: string;
}

export type BootstrapExecutionOutcome =
  | { ok: true; result: ProcessCommandResult }
  | {
    ok: false;
    status: number;
    code: string;
    message: string;
    retryable: boolean;
    details?: ValidationIssue[];
  };

export interface BootstrapExecutor {
  execute(request: BootstrapExecutionRequest): Promise<BootstrapExecutionOutcome>;
}

export interface BootstrapExecutorDependencies {
  database: BootstrapDatabase;
  schemas: SchemaValidator;
  runtimes: RuntimeRegistry;
  defaultRuntimeReleaseKey: string;
  now(): Date;
  uuid(): string;
}

function failure(
  status: number,
  code: string,
  message: string,
  retryable = false,
  details?: ValidationIssue[],
): BootstrapExecutionOutcome {
  return { ok: false, status, code, message, retryable, details };
}

function actorId(membershipId: string): string {
  return `member_${membershipId.replaceAll("-", "")}`;
}

function processRequest(
  command: CommandEnvelope,
  context: GatewayExecutionContext,
  requestHash: string,
  receivedAt: string,
  processedAt: string,
  prepared: Awaited<ReturnType<ReturnType<RuntimeRegistry["find"]>["reduce"]>>,
): Record<string, JsonValue> {
  const actor = context.actor;
  if (!actor) throw new Error("bootstrap_actor_context_required");
  const canonicalActorId = actorId(actor.membership_id);

  return {
    expedition_id: context.expedition_id,
    command: {
      ...command,
      actor_id: canonicalActorId,
      actor_role: "captain",
      day_number: null,
      stage_id: null,
      day_revision: null,
      payload: {
        ...command.payload,
        name: String(command.payload.name).trim(),
      },
    } as unknown as JsonValue,
    actor_context: {
      auth_user_id: actor.auth_user_id,
      profile_id: actor.profile_id,
      membership_id: actor.membership_id,
      participant_id: null,
      actor_id: canonicalActorId,
      actor_role: "captain",
    },
    request_hash: requestHash,
    expected_stream_position: 0,
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

function databaseFailure(error: unknown): BootstrapExecutionOutcome {
  const message = error instanceof Error ? error.message : String(error);
  const mappings: Array<{
    needle: string;
    status: number;
    code: string;
    publicMessage: string;
    retryable: boolean;
  }> = [
    {
      needle: "receipt_actor_mismatch",
      status: 403,
      code: "receipt_actor_mismatch",
      publicMessage: "The stored command belongs to another authenticated actor.",
      retryable: false,
    },
    {
      needle: "idempotency_key_reused_with_different_payload",
      status: 409,
      code: "idempotency_key_reused_with_different_payload",
      publicMessage: "The command ID was already used for another request.",
      retryable: false,
    },
    {
      needle: "expedition_key_already_exists",
      status: 409,
      code: "expedition_key_already_exists",
      publicMessage: "The Expedition key is already in use.",
      retryable: false,
    },
    {
      needle: "active_profile_required",
      status: 403,
      code: "active_profile_required",
      publicMessage: "An active authenticated Profile is required.",
      retryable: false,
    },
    {
      needle: "invalid_timezone",
      status: 400,
      code: "invalid_timezone",
      publicMessage: "The supplied IANA timezone is invalid.",
      retryable: false,
    },
    {
      needle: "runtime_release_unavailable",
      status: 503,
      code: "runtime_release_unavailable",
      publicMessage: "The approved bootstrap runtime is unavailable.",
      retryable: true,
    },
  ];

  for (const mapping of mappings) {
    if (message.includes(mapping.needle)) {
      return failure(
        mapping.status,
        mapping.code,
        mapping.publicMessage,
        mapping.retryable,
      );
    }
  }

  return failure(
    503,
    "bootstrap_persistence_unavailable",
    "The Expedition could not be created.",
    true,
  );
}

export function createExpeditionBootstrapExecutor(
  dependencies: BootstrapExecutorDependencies,
): BootstrapExecutor {
  const validateBootstrapRequest = createBootstrapRequestValidator();

  return {
    async execute(
      request: BootstrapExecutionRequest,
    ): Promise<BootstrapExecutionOutcome> {
      const command = request.command;
      if (command.command_type !== "create_expedition") {
        return failure(
          400,
          "validation_failed",
          "The bootstrap executor accepts only create_expedition.",
        );
      }

      if (command.actor_role !== "captain") {
        return failure(
          403,
          "permission_denied",
          "Only a Captain Profile may create an Expedition.",
        );
      }

      let profile;
      try {
        profile = await dependencies.database.loadActiveProfile(request.auth_user.id);
      } catch {
        return failure(
          503,
          "bootstrap_persistence_unavailable",
          "The authenticated Profile could not be resolved.",
          true,
        );
      }

      if (!profile) {
        return failure(
          403,
          "active_profile_required",
          "An active authenticated Profile is required.",
        );
      }

      if (command.actor_id !== profile.id) {
        return failure(
          403,
          "profile_actor_mismatch",
          "The command Profile does not belong to the authenticated user.",
        );
      }

      let release;
      try {
        release = await dependencies.database.loadRuntimeRelease(
          dependencies.defaultRuntimeReleaseKey,
        );
      } catch {
        return failure(
          503,
          "runtime_release_unavailable",
          "The approved bootstrap runtime could not be resolved.",
          true,
        );
      }

      if (!release) {
        return failure(
          503,
          "runtime_release_unavailable",
          "The approved bootstrap runtime is unavailable.",
          true,
        );
      }

      const runtime = dependencies.runtimes.find(release);
      if (!runtime || !isExpeditionBootstrapRuntime(runtime)) {
        return failure(
          503,
          "runtime_release_unavailable",
          "The approved bootstrap runtime bundle is unavailable.",
          true,
        );
      }

      const expeditionId = dependencies.uuid();
      const membershipId = dependencies.uuid();
      const canonicalActorId = actorId(membershipId);
      const receivedAt = dependencies.now().toISOString();
      const canonicalCommand: CommandEnvelope = {
        ...command,
        actor_id: canonicalActorId,
        actor_role: "captain",
        day_number: null,
        stage_id: null,
        day_revision: null,
        payload: {
          ...command.payload,
          name: String(command.payload.name).trim(),
        },
      };

      const context: GatewayExecutionContext = {
        expedition_id: expeditionId,
        expedition_key: command.expedition_id,
        expedition_status: "absent",
        stream_position: 0,
        projection_version: 0,
        runtime_release: release,
        actor: {
          auth_user_id: request.auth_user.id,
          profile_id: profile.id,
          membership_id: membershipId,
          participant_id: null,
          participant_key: null,
          membership_role: "captain",
        },
        projections: [],
      };

      let prepared;
      try {
        prepared = await runtime.reduce({
          command: canonicalCommand,
          actor_id: canonicalActorId,
          actor_role: "captain",
          context,
          received_at: receivedAt,
        });
      } catch {
        return failure(
          500,
          "runtime_execution_failed",
          "The approved bootstrap runtime failed to process the command.",
          true,
        );
      }

      if (prepared.status !== "accepted") {
        return failure(
          prepared.rejection?.code === "invalid_timezone" ? 400 : 400,
          prepared.rejection?.code ?? "validation_failed",
          prepared.rejection?.message ?? "The Expedition bootstrap was rejected.",
          false,
        );
      }

      const eventIssues = prepared.events.flatMap((event, index) =>
        dependencies.schemas.validatePreparedEvent(event).map((issue) => ({
          path: `/events/${index}${issue.path === "/" ? "" : issue.path}`,
          message: issue.message,
        }))
      );
      if (eventIssues.length) {
        return failure(
          500,
          "runtime_contract_invalid",
          "The bootstrap runtime produced an invalid canonical event.",
          false,
          eventIssues,
        );
      }

      const processedAt = dependencies.now().toISOString();
      const nestedProcessRequest = processRequest(
        canonicalCommand,
        context,
        request.request_hash,
        receivedAt,
        processedAt,
        prepared,
      );

      const processIssues = dependencies.schemas.validateProcessRequest(
        nestedProcessRequest,
      );
      if (processIssues.length) {
        return failure(
          500,
          "runtime_contract_invalid",
          "The prepared bootstrap transaction request is invalid.",
          false,
          processIssues,
        );
      }

      const bootstrapRequest: Record<string, JsonValue> = {
        expedition: {
          id: expeditionId,
          expedition_key: command.expedition_id,
          name: String(command.payload.name).trim(),
          timezone: command.payload.timezone,
          day_boundary_local_time: command.payload.day_boundary_local_time,
          duration_days: runtime.bootstrap_policy.duration_days,
          recovery_days_available: runtime.bootstrap_policy.recovery_days_available,
          runtime_release_id: release.id,
          created_by_profile_id: profile.id,
        },
        captain_membership: {
          id: membershipId,
          profile_id: profile.id,
          role: "captain",
          status: "active",
        },
        process_command_request: nestedProcessRequest,
      };

      const bootstrapIssues = validateBootstrapRequest(bootstrapRequest);
      if (bootstrapIssues.length) {
        return failure(
          500,
          "runtime_contract_invalid",
          "The private bootstrap request is invalid.",
          false,
          bootstrapIssues,
        );
      }

      let result: ProcessCommandResult;
      try {
        result = await dependencies.database.bootstrapExpedition(bootstrapRequest);
      } catch (error) {
        return databaseFailure(error);
      }

      const resultIssues = dependencies.schemas.validateProcessResult(result);
      if (resultIssues.length) {
        return failure(
          500,
          "persistence_contract_invalid",
          "The bootstrap transaction returned an invalid result.",
          false,
          resultIssues,
        );
      }

      return { ok: true, result };
    },
  };
}
