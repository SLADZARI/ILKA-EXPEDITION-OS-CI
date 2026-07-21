import { AuthServiceError } from "./auth.ts";
import type { BootstrapExecutor } from "./bootstrap.ts";
import type { InvitationExecutor } from "./invitation.ts";
import type { RotationExecutor } from "./rotation.ts";
import { commandRequestHash } from "./canonical-json.ts";
import {
  COMMAND_CONTRACTS,
  type GatewayCommandType,
} from "./command-contract.generated.ts";
import type {
  ActorRole,
  CommandEnvelope,
  GatewayDependencies,
  GatewayExecutionContext,
  JsonValue,
  ProcessCommandResult,
  RuntimeBundle,
  RuntimeInput,
  ValidationIssue,
} from "./types.ts";

const MAX_BODY_BYTES = 64 * 1024;
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const CORS_ALLOW_HEADERS = "authorization, apikey, content-type, x-client-info";

interface GatewayErrorBody {
  request_id: string;
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details?: ValidationIssue[];
  };
}

function corsHeaders(origin: string | null, allowed: boolean): HeadersInit {
  const headers: Record<string, string> = {
    ...JSON_HEADERS,
    "access-control-allow-headers": CORS_ALLOW_HEADERS,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
  if (origin && allowed) headers["access-control-allow-origin"] = origin;
  return headers;
}

function jsonResponse(
  status: number,
  body: unknown,
  origin: string | null,
  originAllowed: boolean,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin, originAllowed),
  });
}

function errorResponse(
  status: number,
  requestId: string,
  code: string,
  message: string,
  retryable: boolean,
  origin: string | null,
  originAllowed: boolean,
  details?: ValidationIssue[],
): Response {
  const body: GatewayErrorBody = {
    request_id: requestId,
    error: { code, message, retryable },
  };
  if (details?.length) body.error.details = details;
  return jsonResponse(status, body, origin, originAllowed);
}

function authoritativeActorId(context: GatewayExecutionContext): string | null {
  const actor = context.actor;
  if (!actor) return null;
  if (actor.membership_role === "participant") return actor.participant_key;
  return `member_${actor.membership_id.replaceAll("-", "")}`;
}

function baseActorRole(context: GatewayExecutionContext): ActorRole | null {
  return context.actor?.membership_role ?? null;
}

function isCommandType(value: string): value is GatewayCommandType {
  return Object.hasOwn(COMMAND_CONTRACTS, value);
}

function allowedFor(commandType: GatewayCommandType, role: ActorRole): boolean {
  return (COMMAND_CONTRACTS[commandType].allowedActors as readonly string[])
    .includes(role);
}

function runtimeInput(
  command: CommandEnvelope,
  actorId: string,
  actorRole: ActorRole,
  context: GatewayExecutionContext,
  receivedAt: string,
): RuntimeInput {
  return {
    command: { ...command, actor_id: actorId, actor_role: actorRole },
    actor_id: actorId,
    actor_role: actorRole,
    context,
    received_at: receivedAt,
  };
}

async function resolveEffectiveRole(
  command: CommandEnvelope,
  actorId: string,
  context: GatewayExecutionContext,
  runtime: RuntimeBundle,
  receivedAt: string,
): Promise<ActorRole | null> {
  const role = baseActorRole(context);
  if (!role) return null;

  if (role === "captain") {
    return command.actor_role === "captain" ? "captain" : null;
  }
  if (role === "shore_operator") {
    return command.actor_role === "shore_operator" ? "shore_operator" : null;
  }

  if (command.actor_role === "participant") return "participant";
  if (command.actor_role !== "product_captain") return null;

  const resolved = await runtime.resolveActorRole(
    runtimeInput(command, actorId, "product_captain", context, receivedAt),
  );
  return resolved === "product_captain" ? resolved : null;
}

function processRequest(
  command: CommandEnvelope,
  context: GatewayExecutionContext,
  actorId: string,
  actorRole: ActorRole,
  requestHash: string,
  receivedAt: string,
  processedAt: string,
  prepared: Awaited<ReturnType<RuntimeBundle["reduce"]>>,
): Record<string, JsonValue> {
  const actor = context.actor;
  if (!actor) throw new Error("active_actor_context_required");

  return {
    expedition_id: context.expedition_id,
    command: {
      ...command,
      actor_id: actorId,
      actor_role: actorRole,
    } as unknown as JsonValue,
    actor_context: {
      auth_user_id: actor.auth_user_id,
      profile_id: actor.profile_id,
      membership_id: actor.membership_id,
      participant_id: actor.participant_id,
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

function responseStatus(result: ProcessCommandResult): number {
  return result.outcome === "conflict" ? 409 : 200;
}

export function createCommandGatewayHandler(
  dependencies: GatewayDependencies,
  bootstrapExecutor?: BootstrapExecutor,
  invitationExecutor?: InvitationExecutor,
  rotationExecutor?: RotationExecutor,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const requestId = dependencies.requestId();
    const origin = request.headers.get("origin");
    const originAllowed = origin === null || dependencies.allowedOrigins.has(origin);

    if (!originAllowed) {
      return errorResponse(
        403,
        requestId,
        "origin_not_allowed",
        "The request origin is not allowed.",
        false,
        origin,
        false,
      );
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin, true),
      });
    }

    if (request.method !== "POST") {
      return errorResponse(
        405,
        requestId,
        "method_not_allowed",
        "Only POST is supported.",
        false,
        origin,
        true,
      );
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      return errorResponse(
        415,
        requestId,
        "unsupported_media_type",
        "Content-Type must be application/json.",
        false,
        origin,
        true,
      );
    }

    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return errorResponse(
        413,
        requestId,
        "request_too_large",
        "The command body exceeds 64 KiB.",
        false,
        origin,
        true,
      );
    }

    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return errorResponse(
        413,
        requestId,
        "request_too_large",
        "The command body exceeds 64 KiB.",
        false,
        origin,
        true,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return errorResponse(
        400,
        requestId,
        "invalid_json",
        "The request body is not valid JSON.",
        false,
        origin,
        true,
      );
    }

    const commandIssues = dependencies.schemas.validateCommand(parsed);
    if (commandIssues.length) {
      return errorResponse(
        400,
        requestId,
        "validation_failed",
        "The command does not match the canonical schema.",
        false,
        origin,
        true,
        commandIssues,
      );
    }

    const command = parsed as CommandEnvelope;
    if (command.idempotency_key !== command.command_id) {
      return errorResponse(
        400,
        requestId,
        "validation_failed",
        "idempotency_key must equal command_id.",
        false,
        origin,
        true,
        [{ path: "/idempotency_key", message: "must equal command_id" }],
      );
    }

    if (!isCommandType(command.command_type)) {
      return errorResponse(
        400,
        requestId,
        "validation_failed",
        "Unknown canonical command type.",
        false,
        origin,
        true,
      );
    }

    const requestHash = await commandRequestHash(command);
    const authorization = request.headers.get("authorization") ?? "";

    let authUser;
    try {
      authUser = await dependencies.auth.verify(authorization);
    } catch (error) {
      if (error instanceof AuthServiceError) {
        return errorResponse(
          503,
          requestId,
          "authentication_service_unavailable",
          "Authentication could not be verified.",
          true,
          origin,
          true,
        );
      }
      throw error;
    }

    if (!authUser) {
      return errorResponse(
        401,
        requestId,
        "authentication_required",
        "A valid Supabase session is required.",
        false,
        origin,
        true,
      );
    }

    let existing;
    try {
      existing = await dependencies.database.getReceipt(command.command_id);
    } catch {
      return errorResponse(
        503,
        requestId,
        "persistence_unavailable",
        "The command store is temporarily unavailable.",
        true,
        origin,
        true,
      );
    }

    if (existing) {
      if (
        existing.expedition_key !== command.expedition_id ||
        existing.request_hash !== requestHash
      ) {
        return errorResponse(
          409,
          requestId,
          "idempotency_key_reused_with_different_payload",
          "The command ID was already used for another request.",
          false,
          origin,
          true,
        );
      }

      if (existing.result.receipt.actor_auth_user_id !== authUser.id) {
        return errorResponse(
          403,
          requestId,
          "receipt_actor_mismatch",
          "The stored command belongs to another authenticated actor.",
          false,
          origin,
          true,
        );
      }

      return jsonResponse(
        200,
        { request_id: requestId, data: existing.result },
        origin,
        true,
      );
    }

    if (command.command_type === "create_expedition") {
      if (!bootstrapExecutor) {
        return errorResponse(
          503,
          requestId,
          "runtime_release_unavailable",
          "The approved bootstrap runtime is unavailable.",
          true,
          origin,
          true,
        );
      }

      let outcome;
      try {
        outcome = await bootstrapExecutor.execute({
          command,
          auth_user: authUser,
          request_hash: requestHash,
        });
      } catch {
        return errorResponse(
          503,
          requestId,
          "bootstrap_persistence_unavailable",
          "The Expedition could not be created.",
          true,
          origin,
          true,
        );
      }

      if (!outcome.ok) {
        return errorResponse(
          outcome.status,
          requestId,
          outcome.code,
          outcome.message,
          outcome.retryable,
          origin,
          true,
          outcome.details,
        );
      }

      return jsonResponse(
        responseStatus(outcome.result),
        { request_id: requestId, data: outcome.result },
        origin,
        true,
      );
    }

    if (
      command.command_type === "invite_participant" ||
      command.command_type === "accept_invitation" ||
      command.command_type === "revoke_invitation"
    ) {
      if (!invitationExecutor) {
        return errorResponse(
          503,
          requestId,
          "runtime_release_unavailable",
          "The Expedition's pinned invitation runtime is unavailable.",
          true,
          origin,
          true,
        );
      }

      let outcome;
      try {
        outcome = await invitationExecutor.execute({
          command,
          auth_user: authUser,
          request_hash: requestHash,
        });
      } catch {
        return errorResponse(
          503,
          requestId,
          "invitation_persistence_unavailable",
          "The invitation command could not be committed.",
          true,
          origin,
          true,
        );
      }

      if (!outcome.ok) {
        return errorResponse(
          outcome.status,
          requestId,
          outcome.code,
          outcome.message,
          outcome.retryable,
          origin,
          true,
          outcome.details,
        );
      }

      return jsonResponse(
        responseStatus(outcome.result),
        { request_id: requestId, data: outcome.result },
        origin,
        true,
      );
    }

    if (command.command_type === "generate_rotation") {
      if (!rotationExecutor) {
        return errorResponse(
          503,
          requestId,
          "runtime_release_unavailable",
          "The Expedition's pinned rotation runtime is unavailable.",
          true,
          origin,
          true,
        );
      }

      let outcome;
      try {
        outcome = await rotationExecutor.execute({
          command,
          auth_user: authUser,
          request_hash: requestHash,
        });
      } catch {
        return errorResponse(
          503,
          requestId,
          "rotation_persistence_unavailable",
          "The Rotation Plan could not be committed.",
          true,
          origin,
          true,
        );
      }

      if (!outcome.ok) {
        return errorResponse(
          outcome.status,
          requestId,
          outcome.code,
          outcome.message,
          outcome.retryable,
          origin,
          true,
          outcome.details,
        );
      }

      return jsonResponse(
        responseStatus(outcome.result),
        { request_id: requestId, data: outcome.result },
        origin,
        true,
      );
    }

    let context: GatewayExecutionContext | null;
    try {
      context = await dependencies.database.loadContext(
        command.expedition_id,
        authUser.id,
      );
    } catch {
      return errorResponse(
        503,
        requestId,
        "persistence_unavailable",
        "The Expedition state is temporarily unavailable.",
        true,
        origin,
        true,
      );
    }

    if (!context) {
      return errorResponse(
        404,
        requestId,
        "expedition_not_found",
        "The Expedition does not exist.",
        false,
        origin,
        true,
      );
    }

    if (!context.actor) {
      return errorResponse(
        403,
        requestId,
        "active_membership_required",
        "An active Expedition membership is required.",
        false,
        origin,
        true,
      );
    }

    const actorId = authoritativeActorId(context);
    if (!actorId) {
      return errorResponse(
        403,
        requestId,
        "actor_context_incomplete",
        "The authoritative actor context is incomplete.",
        false,
        origin,
        true,
      );
    }

    if (command.actor_id !== actorId) {
      return errorResponse(
        403,
        requestId,
        "actor_spoofing_detected",
        "The command actor ID does not match the authenticated actor.",
        false,
        origin,
        true,
      );
    }

    if (command.actor_role === "system" || command.actor_role === "system_clock") {
      return errorResponse(
        403,
        requestId,
        "system_actor_not_allowed",
        "System commands cannot be submitted through the public gateway.",
        false,
        origin,
        true,
      );
    }

    const runtime = dependencies.runtimes.find(context.runtime_release);
    if (!runtime) {
      return errorResponse(
        503,
        requestId,
        "runtime_release_unavailable",
        "The Expedition's pinned Engine runtime is not available.",
        true,
        origin,
        true,
      );
    }

    const receivedAt = dependencies.now().toISOString();
    let actorRole: ActorRole | null;
    try {
      actorRole = await resolveEffectiveRole(
        command,
        actorId,
        context,
        runtime,
        receivedAt,
      );
    } catch {
      return errorResponse(
        500,
        requestId,
        "runtime_actor_resolution_failed",
        "The pinned runtime could not resolve the actor role.",
        true,
        origin,
        true,
      );
    }

    if (!actorRole) {
      return errorResponse(
        403,
        requestId,
        "actor_role_spoofing_detected",
        "The command actor role is not authoritative for this Expedition.",
        false,
        origin,
        true,
      );
    }

    if (!allowedFor(command.command_type, actorRole)) {
      return errorResponse(
        403,
        requestId,
        "permission_denied",
        "The authoritative actor cannot submit this command.",
        false,
        origin,
        true,
      );
    }

    const input = runtimeInput(
      command,
      actorId,
      actorRole,
      context,
      receivedAt,
    );

    let prepared;
    try {
      prepared = await runtime.reduce(input);
    } catch {
      return errorResponse(
        500,
        requestId,
        "runtime_execution_failed",
        "The pinned Engine runtime failed to process the command.",
        true,
        origin,
        true,
      );
    }

    const eventIssues = prepared.events.flatMap((event, index) =>
      dependencies.schemas.validatePreparedEvent(event).map((issue) => ({
        path: `/events/${index}${issue.path === "/" ? "" : issue.path}`,
        message: issue.message,
      }))
    );
    if (eventIssues.length) {
      return errorResponse(
        500,
        requestId,
        "runtime_contract_invalid",
        "The pinned runtime produced an invalid canonical event.",
        false,
        origin,
        true,
        eventIssues,
      );
    }

    const projectionIssues = prepared.projection_mutations.flatMap(
      (mutation, index) =>
        dependencies.schemas
          .validateProjection(mutation.schema_id, mutation.projection)
          .map((issue) => ({
            path: `/projection_mutations/${index}/projection${
              issue.path === "/" ? "" : issue.path
            }`,
            message: issue.message,
          })),
    );
    if (projectionIssues.length) {
      return errorResponse(
        500,
        requestId,
        "runtime_contract_invalid",
        "The pinned runtime produced an invalid authoritative projection.",
        false,
        origin,
        true,
        projectionIssues,
      );
    }

    const processedAt = dependencies.now().toISOString();
    const persistenceRequest = processRequest(
      command,
      context,
      actorId,
      actorRole,
      requestHash,
      receivedAt,
      processedAt,
      prepared,
    );

    const requestIssues = dependencies.schemas.validateProcessRequest(
      persistenceRequest,
    );
    if (requestIssues.length) {
      return errorResponse(
        500,
        requestId,
        "runtime_contract_invalid",
        "The prepared transaction request is invalid.",
        false,
        origin,
        true,
        requestIssues,
      );
    }

    let result: ProcessCommandResult;
    try {
      result = await dependencies.database.processCommand(persistenceRequest);
    } catch {
      return errorResponse(
        503,
        requestId,
        "persistence_unavailable",
        "The command could not be committed.",
        true,
        origin,
        true,
      );
    }

    const resultIssues = dependencies.schemas.validateProcessResult(result);
    if (resultIssues.length) {
      return errorResponse(
        500,
        requestId,
        "persistence_contract_invalid",
        "The transaction returned an invalid result.",
        false,
        origin,
        true,
        resultIssues,
      );
    }

    return jsonResponse(
      responseStatus(result),
      { request_id: requestId, data: result },
      origin,
      true,
    );
  };
}
