import type {
  ActorRole,
  JsonValue,
  PreparedCommandResult,
  PreparedProjectionMutation,
  ProjectionDocument,
  RuntimeBundle,
  RuntimeInput,
} from "../command-gateway/types.ts";

export const TODAY_VIEW_SCHEMA_ID =
  "https://ilka.local/schemas/today-view.schema.json";
export const CAPTAIN_DAY_VIEW_SCHEMA_ID =
  "https://ilka.local/schemas/captain-day-view.schema.json";
export const READ_MODEL_SCHEMA_VERSION = "1";

export interface Day1CompleteTaskReleaseMetadata {
  release_key: string;
  git_commit_sha: string;
  rules_release: string;
  content_release: string;
  reducer_version: string;
}

type JsonObject = Record<string, JsonValue>;

type TaskStatus =
  | "available"
  | "in_progress"
  | "blocked"
  | "completed"
  | "overdue"
  | "completed_late"
  | "waived";

interface TodayTask extends JsonObject {
  task_id: string;
  title: string;
  status: TaskStatus;
  due_day_number?: number;
  pending_sync?: boolean;
}

interface TodayView extends JsonObject {
  expedition_id: string;
  participant_id: string;
  local_date: string;
  day: JsonObject & { number: number; status: string };
  stage: JsonObject & { stage_id: string; title: string };
  product_role: (JsonObject & { role_id?: string }) | null;
  tasks: TodayTask[];
  sync_status: string;
}

interface CaptainParticipant extends JsonObject {
  participant_id: string;
  required_tasks_terminal: boolean;
  sync_status?: string;
}

interface CaptainBlocker extends JsonObject {
  code: string;
  message: string;
  entity_id: string;
}

interface CaptainDayView extends JsonObject {
  expedition_id: string;
  day: JsonObject & { number: number; status: string; revision: number };
  participants: CaptainParticipant[];
  blockers: CaptainBlocker[];
  can_close_day: boolean;
  sync_status: string;
  completion_readiness: JsonObject & { expected_projection_version: number };
}

const TERMINAL_TASK_STATUSES = new Set<TaskStatus>([
  "completed",
  "completed_late",
  "waived",
]);

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && [
    "available",
    "in_progress",
    "blocked",
    "completed",
    "overdue",
    "completed_late",
    "waived",
  ].includes(value);
}

function asTodayView(value: JsonObject): TodayView | null {
  if (
    typeof value.expedition_id !== "string" ||
    typeof value.participant_id !== "string" ||
    typeof value.local_date !== "string" ||
    !isObject(value.day) ||
    typeof value.day.number !== "number" ||
    typeof value.day.status !== "string" ||
    !isObject(value.stage) ||
    typeof value.stage.stage_id !== "string" ||
    typeof value.stage.title !== "string" ||
    !Array.isArray(value.tasks) ||
    typeof value.sync_status !== "string"
  ) {
    return null;
  }

  const tasks: TodayTask[] = [];
  for (const task of value.tasks) {
    if (
      !isObject(task) ||
      typeof task.task_id !== "string" ||
      typeof task.title !== "string" ||
      !isTaskStatus(task.status) ||
      (task.due_day_number !== undefined &&
        typeof task.due_day_number !== "number")
    ) {
      return null;
    }
    tasks.push(task as TodayTask);
  }

  return value as TodayView;
}

function asCaptainDayView(value: JsonObject): CaptainDayView | null {
  if (
    typeof value.expedition_id !== "string" ||
    !isObject(value.day) ||
    typeof value.day.number !== "number" ||
    typeof value.day.status !== "string" ||
    typeof value.day.revision !== "number" ||
    !Array.isArray(value.participants) ||
    !Array.isArray(value.blockers) ||
    typeof value.can_close_day !== "boolean" ||
    typeof value.sync_status !== "string" ||
    !isObject(value.completion_readiness) ||
    typeof value.completion_readiness.expected_projection_version !== "number"
  ) {
    return null;
  }

  for (const participant of value.participants) {
    if (
      !isObject(participant) ||
      typeof participant.participant_id !== "string" ||
      typeof participant.required_tasks_terminal !== "boolean"
    ) {
      return null;
    }
  }

  for (const blocker of value.blockers) {
    if (
      !isObject(blocker) ||
      typeof blocker.code !== "string" ||
      typeof blocker.message !== "string" ||
      typeof blocker.entity_id !== "string"
    ) {
      return null;
    }
  }

  return value as CaptainDayView;
}

function projection(
  input: RuntimeInput,
  projectionKey: string,
  projectionType: string,
  schemaId: string,
): ProjectionDocument | null {
  const document = input.context.projections.find((candidate) =>
    candidate.projection_key === projectionKey
  );
  if (!document) return null;
  if (
    document.projection_type !== projectionType ||
    document.schema_id !== schemaId ||
    document.schema_version !== READ_MODEL_SCHEMA_VERSION
  ) {
    return null;
  }
  return document;
}

function rejected(code: string, message: string): PreparedCommandResult {
  return {
    status: "rejected",
    events: [],
    projection_mutations: [],
    rejection: { code, message },
  };
}

function mutation(
  projectionKey: string,
  projectionType: string,
  subjectId: string | null,
  schemaId: string,
  value: JsonObject,
): PreparedProjectionMutation {
  return {
    operation: "upsert",
    projection_key: projectionKey,
    projection_type: projectionType,
    subject_id: subjectId,
    schema_id: schemaId,
    schema_version: READ_MODEL_SCHEMA_VERSION,
    projection: value,
  };
}

function eventId(commandId: string): string {
  return `evt_${commandId.slice(4)}_01`;
}

function todayProjectionKey(participantKey: string): string {
  return `today_view:${participantKey}`;
}

function isProductCaptain(today: TodayView): boolean {
  return isObject(today.product_role) &&
    today.product_role.role_id === "product_captain";
}

function resolveToday(input: RuntimeInput): {
  document: ProjectionDocument;
  view: TodayView;
} | null {
  const participantKey = input.context.actor?.participant_key;
  if (!participantKey) return null;
  const document = projection(
    input,
    todayProjectionKey(participantKey),
    "today_view",
    TODAY_VIEW_SCHEMA_ID,
  );
  if (!document) return null;
  const view = asTodayView(document.projection);
  return view ? { document, view } : null;
}

function resolveCaptain(input: RuntimeInput): {
  document: ProjectionDocument;
  view: CaptainDayView;
} | null {
  const document = projection(
    input,
    "captain_day_view",
    "captain_day_view",
    CAPTAIN_DAY_VIEW_SCHEMA_ID,
  );
  if (!document) return null;
  const view = asCaptainDayView(document.projection);
  return view ? { document, view } : null;
}

async function resolveActorRole(input: RuntimeInput): Promise<ActorRole> {
  if (input.actor_role !== "product_captain") return input.actor_role;
  const resolved = resolveToday(input);
  return resolved && isProductCaptain(resolved.view)
    ? "product_captain"
    : "participant";
}

async function reduceCompleteTask(
  input: RuntimeInput,
): Promise<PreparedCommandResult> {
  if (input.command.command_type !== "complete_task") {
    return rejected(
      "command_not_implemented_in_runtime",
      `Runtime ${input.context.runtime_release.reducer_version} does not implement ${input.command.command_type}.`,
    );
  }

  if (input.context.expedition_status !== "active") {
    return rejected(
      "expedition_not_active",
      "Tasks can be completed only in an active Expedition.",
    );
  }

  if (input.actor_role === "captain") {
    return rejected(
      "task_target_ambiguous_for_captain",
      "The current complete_task command has no target Participant assignment.",
    );
  }

  const actor = input.context.actor;
  if (!actor?.participant_id || !actor.participant_key) {
    return rejected(
      "participant_context_required",
      "A domain Participant identity is required to complete this task.",
    );
  }

  const todayResolved = resolveToday(input);
  if (!todayResolved) {
    return rejected(
      "participant_projection_missing",
      "The authoritative Participant TodayView is unavailable or incompatible.",
    );
  }

  const captainResolved = resolveCaptain(input);
  if (!captainResolved) {
    return rejected(
      "captain_projection_missing",
      "The authoritative CaptainDayView is unavailable or incompatible.",
    );
  }

  const today = structuredClone(todayResolved.view);
  const captain = structuredClone(captainResolved.view);

  if (
    today.expedition_id !== input.context.expedition_key ||
    captain.expedition_id !== input.context.expedition_key ||
    today.participant_id !== actor.participant_key ||
    today.day.number !== captain.day.number
  ) {
    return rejected(
      "projection_contract_mismatch",
      "The Day 1 projections do not identify the same Expedition, Participant and Day.",
    );
  }

  if (!new Set(["active", "review"]).has(today.day.status)) {
    return rejected(
      "day_not_mutable",
      "Tasks can be completed only while the Day is active or in review.",
    );
  }

  const taskId = input.command.payload.task_id;
  if (typeof taskId !== "string" || taskId.length === 0) {
    return rejected("task_not_found", "The requested task does not exist.");
  }

  const task = today.tasks.find((candidate) => candidate.task_id === taskId);
  if (!task) {
    return rejected(
      "actor_cannot_complete_assignment",
      "The task is not assigned to the authenticated Participant.",
    );
  }

  if (TERMINAL_TASK_STATUSES.has(task.status)) {
    return rejected(
      "task_already_terminal",
      `Task ${taskId} is already ${task.status}.`,
    );
  }

  const participant = captain.participants.find((candidate) =>
    candidate.participant_id === actor.participant_key
  );
  if (!participant) {
    return rejected(
      "projection_contract_mismatch",
      "CaptainDayView does not contain the authenticated Participant.",
    );
  }

  const previousStatus = task.status;
  const dueDayNumber = task.due_day_number;
  const completedOnDayNumber = today.day.number;
  const completedLate = typeof dueDayNumber === "number" &&
    completedOnDayNumber > dueDayNumber;
  const nextStatus: TaskStatus = completedLate ? "completed_late" : "completed";

  task.status = nextStatus;
  task.pending_sync = false;
  today.sync_status = "synced";

  const requiredTasksTerminal = today.tasks.every((candidate) =>
    TERMINAL_TASK_STATUSES.has(candidate.status)
  );
  participant.required_tasks_terminal = requiredTasksTerminal;
  participant.sync_status = "synced";

  if (requiredTasksTerminal) {
    const actorTaskIds = new Set(today.tasks.map((candidate) => candidate.task_id));
    captain.blockers = captain.blockers.filter((blocker) =>
      blocker.code !== "required_task_incomplete" ||
      !actorTaskIds.has(blocker.entity_id)
    );
  }
  captain.can_close_day = captain.blockers.length === 0;
  captain.day.revision += 1;
  captain.sync_status = "synced";
  captain.completion_readiness.expected_projection_version =
    input.context.projection_version + 1;

  const payload: JsonObject = {
    task_id: taskId,
    participant_id: actor.participant_key,
    previous_status: previousStatus,
    completed_on_day_number: completedOnDayNumber,
  };
  if (typeof dueDayNumber === "number") payload.due_day_number = dueDayNumber;

  const eventType = completedLate ? "task.completed_late" : "task.completed";
  const event: JsonObject = {
    event_id: eventId(input.command.command_id),
    event_type: eventType,
    occurred_at: input.command.issued_at,
    recorded_at: input.received_at,
    actor_id: input.actor_id,
    actor_role: input.actor_role,
    expedition_id: input.context.expedition_key,
    day_number: today.day.number,
    stage_id: today.stage.stage_id,
    command_id: input.command.command_id,
    idempotency_key: input.command.idempotency_key,
    device_id: input.command.device_id ?? null,
    sync_status: "synced",
    schema_version: 1,
    payload,
    day_revision: captain.day.revision,
  };

  return {
    status: "accepted",
    events: [event],
    projection_mutations: [
      mutation(
        todayProjectionKey(actor.participant_key),
        "today_view",
        actor.participant_key,
        TODAY_VIEW_SCHEMA_ID,
        today,
      ),
      mutation(
        "captain_day_view",
        "captain_day_view",
        null,
        CAPTAIN_DAY_VIEW_SCHEMA_ID,
        captain,
      ),
    ],
    rejection: null,
  };
}

export function createDay1CompleteTaskRuntime(
  metadata: Day1CompleteTaskReleaseMetadata,
): RuntimeBundle {
  return {
    ...metadata,
    resolveActorRole,
    reduce: reduceCompleteTask,
  };
}
