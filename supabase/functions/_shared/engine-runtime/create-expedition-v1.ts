import type {
  BootstrapProgramPolicy,
  BootstrapRuntimeCapability,
  BootstrapRuntimeInput,
  JsonValue,
  PreparedCommandResult,
} from "../command-gateway/types.ts";

type JsonObject = Record<string, JsonValue>;

const EXPEDITION_KEY_PATTERN = /^[a-z0-9][a-z0-9_]{0,127}$/;
const BOUNDARY_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function rejected(code: string, message: string): PreparedCommandResult {
  return {
    status: "rejected",
    events: [],
    projection_mutations: [],
    rejection: { code, message },
  };
}

function eventId(commandId: string): string {
  return `evt_${commandId.slice(4)}_01`;
}

function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function validProgram(program: BootstrapProgramPolicy): boolean {
  return Number.isInteger(program.duration_days) &&
    program.duration_days > 0 &&
    program.duration_days <= 365 &&
    Number.isInteger(program.recovery_days_available) &&
    program.recovery_days_available >= 0 &&
    program.recovery_days_available <= program.duration_days;
}

async function reduceCreateExpedition(
  input: BootstrapRuntimeInput,
  program: BootstrapProgramPolicy,
): Promise<PreparedCommandResult> {
  const command = input.command;
  if (command.command_type !== "create_expedition") {
    return rejected(
      "command_not_implemented_in_bootstrap_runtime",
      `Bootstrap runtime does not implement ${command.command_type}.`,
    );
  }

  if (input.actor.profile_status !== "active") {
    return rejected(
      "active_profile_required",
      "An active authenticated Profile is required to create an Expedition.",
    );
  }

  if (
    input.actor_role !== "captain" ||
    command.actor_role !== "captain"
  ) {
    return rejected(
      "validation_failed",
      "create_expedition requires the Captain actor role.",
    );
  }

  if (
    !UUID_PATTERN.test(input.actor.auth_user_id) ||
    !UUID_PATTERN.test(input.actor.profile_id) ||
    !UUID_PATTERN.test(input.actor.membership_id)
  ) {
    return rejected(
      "validation_failed",
      "Bootstrap actor identifiers must be canonical UUID values.",
    );
  }

  const expectedActorId = `member_${input.actor.membership_id.replaceAll("-", "")}`;
  if (
    input.actor_id !== expectedActorId ||
    command.actor_id !== expectedActorId
  ) {
    return rejected(
      "profile_actor_mismatch",
      "The canonical Captain membership actor does not match the bootstrap context.",
    );
  }

  if (!EXPEDITION_KEY_PATTERN.test(command.expedition_id)) {
    return rejected(
      "validation_failed",
      "The Expedition key must use stable snake_case characters.",
    );
  }

  if (command.idempotency_key !== command.command_id) {
    return rejected(
      "validation_failed",
      "The canonical idempotency key must equal command_id.",
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

  const name = command.payload.name;
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    name.length > 200 ||
    name !== name.trim()
  ) {
    return rejected(
      "validation_failed",
      "Expedition name must be non-empty, trimmed and at most 200 characters.",
    );
  }

  const timezone = command.payload.timezone;
  if (
    typeof timezone !== "string" ||
    timezone.length === 0 ||
    timezone.length > 100 ||
    timezone !== timezone.trim() ||
    !validTimeZone(timezone)
  ) {
    return rejected(
      "invalid_timezone",
      "Expedition timezone must be a valid IANA timezone name.",
    );
  }

  const durationDays = command.payload.duration_days;
  if (
    !Number.isInteger(durationDays) ||
    durationDays !== program.duration_days
  ) {
    return rejected(
      "validation_failed",
      `Expedition duration must equal the pinned program duration of ${program.duration_days} days.`,
    );
  }

  const dayBoundaryLocalTime = command.payload.day_boundary_local_time;
  if (
    typeof dayBoundaryLocalTime !== "string" ||
    !BOUNDARY_TIME_PATTERN.test(dayBoundaryLocalTime)
  ) {
    return rejected(
      "validation_failed",
      "Day boundary must use a valid HH:mm local time.",
    );
  }

  const payload: JsonObject = {
    name,
    timezone,
    duration_days: durationDays,
    day_boundary_local_time: dayBoundaryLocalTime,
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
    command_id: command.command_id,
    idempotency_key: command.idempotency_key,
    device_id: command.device_id ?? null,
    sync_status: "synced",
    schema_version: 1,
    payload,
    day_revision: null,
  };

  return {
    status: "accepted",
    events: [event],
    projection_mutations: [],
    rejection: null,
  };
}

export function createExpeditionBootstrapCapability(
  program: BootstrapProgramPolicy,
): BootstrapRuntimeCapability {
  if (!validProgram(program)) {
    throw new TypeError("invalid_bootstrap_program_policy");
  }
  const pinnedProgram = Object.freeze({ ...program });
  return {
    program: pinnedProgram,
    reduceCreateExpedition: (input) => reduceCreateExpedition(input, pinnedProgram),
  };
}
