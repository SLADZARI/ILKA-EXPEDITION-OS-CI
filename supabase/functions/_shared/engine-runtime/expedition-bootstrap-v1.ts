import type {
  ActorRole,
  JsonValue,
  PreparedCommandResult,
  RuntimeBundle,
  RuntimeInput,
} from "../command-gateway/types.ts";

export interface ExpeditionBootstrapReleaseMetadata {
  release_key: string;
  git_commit_sha: string;
  rules_release: string;
  content_release: string;
  reducer_version: string;
  duration_days: number;
  recovery_days_available: number;
}

export interface ExpeditionBootstrapRuntime extends RuntimeBundle {
  readonly bootstrap_policy: {
    duration_days: number;
    recovery_days_available: number;
  };
}

type JsonObject = Record<string, JsonValue>;

function rejected(code: string, message: string): PreparedCommandResult {
  return {
    status: "rejected",
    events: [],
    projection_mutations: [],
    rejection: { code, message },
  };
}

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function eventId(commandId: string): string {
  return `evt_${commandId.slice(4)}_01`;
}

async function resolveActorRole(input: RuntimeInput): Promise<ActorRole> {
  return input.actor_role;
}

function reduceCreateExpedition(
  input: RuntimeInput,
  policy: ExpeditionBootstrapRuntime["bootstrap_policy"],
): PreparedCommandResult {
  const command = input.command;
  const actor = input.context.actor;

  if (command.command_type !== "create_expedition") {
    return rejected(
      "command_not_implemented_in_runtime",
      `Runtime ${input.context.runtime_release.reducer_version} does not implement ${command.command_type}.`,
    );
  }

  if (input.context.expedition_status !== "absent") {
    return rejected(
      "invalid_state",
      "create_expedition requires an absent Expedition aggregate.",
    );
  }

  if (
    input.context.stream_position !== 0 ||
    input.context.projection_version !== 0 ||
    input.context.projections.length !== 0
  ) {
    return rejected(
      "invalid_state",
      "Bootstrap context must start at stream and projection version zero.",
    );
  }

  if (
    input.actor_role !== "captain" ||
    command.actor_role !== "captain" ||
    !actor ||
    actor.membership_role !== "captain" ||
    actor.participant_id !== null ||
    actor.participant_key !== null
  ) {
    return rejected(
      "permission_denied",
      "An authenticated Profile with a prepared Captain membership is required.",
    );
  }

  const expectedActorId = `member_${actor.membership_id.replaceAll("-", "")}`;
  if (input.actor_id !== expectedActorId || command.actor_id !== expectedActorId) {
    return rejected(
      "profile_actor_mismatch",
      "The canonical Captain actor does not match the prepared membership.",
    );
  }

  if (!/^[a-z0-9][a-z0-9_]{0,127}$/.test(command.expedition_id)) {
    return rejected(
      "validation_failed",
      "The Expedition key must be stable snake_case.",
    );
  }

  const nameValue = command.payload.name;
  const timezoneValue = command.payload.timezone;
  const durationValue = command.payload.duration_days;
  const boundaryValue = command.payload.day_boundary_local_time;

  if (
    typeof nameValue !== "string" ||
    nameValue.trim().length === 0 ||
    nameValue.trim().length > 200
  ) {
    return rejected(
      "validation_failed",
      "The Expedition name must contain between 1 and 200 non-whitespace characters.",
    );
  }

  if (
    typeof timezoneValue !== "string" ||
    timezoneValue.length > 100 ||
    !validTimezone(timezoneValue)
  ) {
    return rejected("invalid_timezone", "The supplied IANA timezone is invalid.");
  }

  if (
    typeof durationValue !== "number" ||
    !Number.isInteger(durationValue) ||
    durationValue !== policy.duration_days
  ) {
    return rejected(
      "validation_failed",
      "duration_days must equal the selected runtime program duration.",
    );
  }

  if (
    typeof boundaryValue !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(boundaryValue)
  ) {
    return rejected(
      "validation_failed",
      "day_boundary_local_time must use HH:MM local time.",
    );
  }

  if (
    command.day_number != null ||
    command.stage_id != null ||
    command.day_revision != null
  ) {
    return rejected(
      "validation_failed",
      "create_expedition cannot include Day, Stage or Day revision context.",
    );
  }

  const normalizedName = nameValue.trim();
  const payload: JsonObject = {
    name: normalizedName,
    timezone: timezoneValue,
    duration_days: policy.duration_days,
    recovery_days_available: policy.recovery_days_available,
    day_boundary_local_time: boundaryValue,
  };

  const event: JsonObject = {
    event_id: eventId(command.command_id),
    event_type: "expedition.created",
    occurred_at: command.issued_at,
    recorded_at: input.received_at,
    actor_id: input.actor_id,
    actor_role: "captain",
    expedition_id: command.expedition_id,
    day_number: null,
    stage_id: null,
    day_revision: null,
    command_id: command.command_id,
    idempotency_key: command.command_id,
    schema_version: 1,
    payload,
  };

  return {
    status: "accepted",
    events: [event],
    projection_mutations: [],
    rejection: null,
  };
}

export function createExpeditionBootstrapRuntime(
  metadata: ExpeditionBootstrapReleaseMetadata,
): ExpeditionBootstrapRuntime {
  if (!Number.isInteger(metadata.duration_days) || metadata.duration_days < 1) {
    throw new Error("invalid_bootstrap_duration_days");
  }
  if (
    !Number.isInteger(metadata.recovery_days_available) ||
    metadata.recovery_days_available < 0 ||
    metadata.recovery_days_available > metadata.duration_days
  ) {
    throw new Error("invalid_bootstrap_recovery_days_available");
  }

  const bootstrapPolicy = Object.freeze({
    duration_days: metadata.duration_days,
    recovery_days_available: metadata.recovery_days_available,
  });

  return Object.freeze({
    release_key: metadata.release_key,
    git_commit_sha: metadata.git_commit_sha,
    rules_release: metadata.rules_release,
    content_release: metadata.content_release,
    reducer_version: metadata.reducer_version,
    bootstrap_policy: bootstrapPolicy,
    resolveActorRole,
    reduce: async (input: RuntimeInput) =>
      reduceCreateExpedition(input, bootstrapPolicy),
  });
}

export function isExpeditionBootstrapRuntime(
  value: RuntimeBundle,
): value is ExpeditionBootstrapRuntime {
  const candidate = value as Partial<ExpeditionBootstrapRuntime>;
  return candidate.bootstrap_policy !== undefined &&
    Number.isInteger(candidate.bootstrap_policy.duration_days) &&
    Number.isInteger(candidate.bootstrap_policy.recovery_days_available);
}
