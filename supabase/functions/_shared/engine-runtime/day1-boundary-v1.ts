import type {
  ActorRole,
  CommandEnvelope,
  GatewayExecutionContext,
  JsonValue,
  PreparedCommandResult,
  PreparedProjectionMutation,
  RuntimeBundle,
} from "../command-gateway/types.ts";

export const DAY1_TODAY_VIEW_SCHEMA_ID =
  "https://ilka.local/schemas/today-view.schema.json";
export const DAY1_CAPTAIN_VIEW_SCHEMA_ID =
  "https://ilka.local/schemas/captain-day-view.schema.json";
export const DAY1_READ_MODEL_SCHEMA_VERSION = "1";

export interface SystemExecutionContext extends GatewayExecutionContext {
  actor: null;
  expedition_timezone: string;
  day_boundary_local_time: string;
  duration_days: number;
  active_stage_id: string | null;
  expedition_started_at: string | null;
}

export interface BoundaryCardDefinition {
  card_id: string;
  type: "knowledge" | "safety" | "task" | "role" | "onboard";
  title: string;
  required: boolean;
}

export interface BoundaryOutputDefinition {
  output_id: string;
  title: string;
  required: boolean;
}

export interface Day1BoundaryReleaseMetadata {
  release_key: string;
  git_commit_sha: string;
  rules_release: string;
  content_release: string;
  reducer_version: string;
  day_number: 1;
  stage_id: "onboarding";
  stage_title: string;
  next_stage_id: string | null;
  rotation_rules_version: number;
  product_role_titles: Record<string, string>;
  onboard_role_titles: Record<string, string>;
  shared_cards: BoundaryCardDefinition[];
  product_role_cards: Record<string, BoundaryCardDefinition[]>;
  onboard_role_cards: Record<string, BoundaryCardDefinition[]>;
  required_outputs: BoundaryOutputDefinition[];
}

export interface Day1BoundaryInput {
  command: CommandEnvelope;
  actor_id: "system_clock";
  actor_role: "system_clock";
  context: SystemExecutionContext;
  received_at: string;
}

export interface Day1BoundaryRuntime extends RuntimeBundle {
  readonly day1_policy: Omit<Day1BoundaryReleaseMetadata, keyof RuntimeBundle>;
  reduceBoundary(input: Day1BoundaryInput): Promise<PreparedCommandResult>;
}

type JsonObject = Record<string, JsonValue>;

type SetupParticipant = {
  participant_id: string;
  display_name: string;
  participant_order: number;
  status: "active" | "banned";
};

type SetupAssignment = {
  participant_id: string;
  product_role_id: string;
  onboard_role_id: string;
};

type SetupView = {
  expedition_id: string;
  expedition_status: string;
  participants: SetupParticipant[];
  rotation: {
    status: "not_generated" | "generated";
    rotation_id: string | null;
    rules_version: number | null;
    assignments: SetupAssignment[];
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

function formatInTimeZone(value: Date, timeZone: string): {
  date: string;
  time: string;
} | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes): string | undefined =>
      parts.find((candidate) => candidate.type === type)?.value;
    const year = part("year");
    const month = part("month");
    const day = part("day");
    const hour = part("hour");
    const minute = part("minute");
    if (!year || !month || !day || !hour || !minute) return null;
    return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
  } catch {
    return null;
  }
}

function asSetupView(value: JsonObject): SetupView | null {
  if (
    typeof value.expedition_id !== "string" ||
    typeof value.expedition_status !== "string" ||
    !Array.isArray(value.participants) ||
    !isObject(value.rotation) ||
    typeof value.expected_projection_version !== "number" ||
    value.sync_status !== "synced"
  ) return null;
  return value as unknown as SetupView;
}

function setupView(input: Day1BoundaryInput): SetupView | null {
  const document = input.context.projections.find((candidate) =>
    candidate.projection_key === "expedition_setup_view"
  );
  if (
    !document || document.projection_type !== "expedition_setup_view" ||
    document.subject_id !== null ||
    document.schema_id !==
      "https://ilka.local/schemas/expedition-setup-view.schema.json" ||
    document.schema_version !== "1"
  ) return null;
  return asSetupView(document.projection);
}

function mutation(
  projectionKey: string,
  projectionType: "today_view" | "captain_day_view",
  subjectId: string | null,
  schemaId: string,
  projection: JsonObject,
): PreparedProjectionMutation {
  return {
    operation: "upsert",
    projection_key: projectionKey,
    projection_type: projectionType,
    subject_id: subjectId,
    schema_id: schemaId,
    schema_version: DAY1_READ_MODEL_SCHEMA_VERSION,
    projection,
  };
}

function event(
  input: Day1BoundaryInput,
  ordinal: number,
  eventType: string,
  payload: JsonObject,
): JsonObject {
  return {
    event_id: eventId(input.command.command_id, ordinal),
    event_type: eventType,
    occurred_at: input.received_at,
    recorded_at: input.received_at,
    actor_id: "system_clock",
    actor_role: "system_clock",
    expedition_id: input.context.expedition_key,
    day_number: 1,
    stage_id: "onboarding",
    day_revision: 1,
    command_id: input.command.command_id,
    idempotency_key: input.command.command_id,
    device_id: null,
    sync_status: "synced",
    payload,
    correction_of: null,
  };
}

function assertPolicy(policy: Day1BoundaryRuntime["day1_policy"]): void {
  if (
    policy.day_number !== 1 || policy.stage_id !== "onboarding" ||
    policy.rotation_rules_version < 1 || !policy.stage_title
  ) throw new Error("invalid_day1_boundary_policy");
  const cardIds: string[] = [];
  for (const card of policy.shared_cards) cardIds.push(card.card_id);
  for (const cards of Object.values(policy.product_role_cards)) {
    for (const card of cards) cardIds.push(card.card_id);
  }
  for (const cards of Object.values(policy.onboard_role_cards)) {
    for (const card of cards) cardIds.push(card.card_id);
  }
  if (new Set(cardIds).size !== cardIds.length) {
    throw new Error("duplicate_day1_card_reference");
  }
  const outputs = policy.required_outputs.map((output) => output.output_id);
  if (new Set(outputs).size !== outputs.length) {
    throw new Error("duplicate_day1_output_reference");
  }
}

function cardsFor(
  policy: Day1BoundaryRuntime["day1_policy"],
  productRoleId: string,
  onboardRoleId: string,
): BoundaryCardDefinition[] | null {
  const product = policy.product_role_cards[productRoleId];
  const onboard = policy.onboard_role_cards[onboardRoleId];
  if (!product || !onboard) return null;
  const cards = [...policy.shared_cards, ...product, ...onboard];
  const ids = cards.map((card) => card.card_id);
  return new Set(ids).size === ids.length ? cards : null;
}

function todayView(
  input: Day1BoundaryInput,
  participant: SetupParticipant,
  assignment: SetupAssignment,
  cards: BoundaryCardDefinition[],
  policy: Day1BoundaryRuntime["day1_policy"],
  localDate: string,
): JsonObject {
  const tasks = cards.filter((card) => card.type === "task").map((card) => ({
    task_id: card.card_id,
    title: card.title,
    status: "available",
    due_day_number: 1,
    pending_sync: false,
  }));
  return {
    expedition_id: input.context.expedition_key,
    participant_id: participant.participant_id,
    local_date: localDate,
    day: {
      number: 1,
      status: "active",
      boundary_sync_state: "authoritative",
    },
    stage: {
      stage_id: policy.stage_id,
      title: policy.stage_title,
      status: "active",
      next_stage_id: policy.next_stage_id,
      advance_request_status: "none",
      pending_target_stage_id: null,
    },
    product_role: {
      assignment_id: `assignment_day_01_${participant.participant_id}_product`,
      role_id: assignment.product_role_id,
      title: policy.product_role_titles[assignment.product_role_id],
      state: "active",
    },
    onboard_role: {
      assignment_id: `assignment_day_01_${participant.participant_id}_onboard`,
      role_id: assignment.onboard_role_id,
      title: policy.onboard_role_titles[assignment.onboard_role_id],
      state: "active",
    },
    cards: cards.map((card) => ({
      card_id: card.card_id,
      title: card.title,
      required: card.required,
      acknowledged: false,
      pending_sync: false,
    })),
    tasks,
    sync_status: "synced",
    outputs: policy.required_outputs.map((output) => ({
      output_id: output.output_id,
      title: output.title,
      required: output.required,
      confirmed: false,
      pending_sync: false,
    })),
    decision_vote: null,
    gamification: null,
    expedition_status: "active",
    expedition_completion: null,
  };
}

function captainView(
  input: Day1BoundaryInput,
  ordered: SetupParticipant[],
  assignments: Map<string, SetupAssignment>,
  cardsByParticipant: Map<string, BoundaryCardDefinition[]>,
  policy: Day1BoundaryRuntime["day1_policy"],
  localDate: string,
  boundaryAt: string,
): JsonObject {
  const blockers: JsonObject[] = [];
  for (const participant of ordered) {
    const cards = cardsByParticipant.get(participant.participant_id) ?? [];
    if (cards.some((card) => card.required && card.type !== "task")) {
      blockers.push({
        code: "required_cards_unacknowledged",
        message: "Required Day 1 cards are not acknowledged",
        entity_id: participant.participant_id,
      });
    }
    for (const task of cards.filter((card) => card.type === "task" && card.required)) {
      blockers.push({
        code: "required_task_incomplete",
        message: `${task.title} is not terminal`,
        entity_id: `${participant.participant_id}:${task.card_id}`,
      });
    }
  }
  for (const output of policy.required_outputs.filter((item) => item.required)) {
    blockers.push({
      code: "required_output_unconfirmed",
      message: `${output.title} is not confirmed`,
      entity_id: output.output_id,
    });
  }

  return {
    expedition_id: input.context.expedition_key,
    local_date: localDate,
    day: {
      number: 1,
      stage_id: policy.stage_id,
      status: "active",
      boundary_at: boundaryAt,
      revision: 1,
      superseded_day_numbers: [],
      transition_mode: "automatic",
    },
    participants: ordered.map((participant) => {
      const assignment = assignments.get(participant.participant_id)!;
      return {
        participant_id: participant.participant_id,
        product_role_id: assignment.product_role_id,
        onboard_role_id: assignment.onboard_role_id,
        required_cards_acknowledged: false,
        required_tasks_terminal: false,
        overdue_task_count: 0,
        sync_status: "synced",
        status: "active",
        access_revoked: false,
      };
    }),
    blockers,
    can_close_day: false,
    controls: {
      override_day_close: true,
      recover_day_transition: true,
      activate_recovery_day: true,
      override_role_assignment: true,
      normal_start_day: false,
      request_stage_advance: true,
      advance_stage: false,
      override_stage_advance: true,
      force_day_transition: true,
      rewind_day: true,
      ban_participant: true,
      unban_participant: true,
      create_decision_draft: false,
      create_vote: false,
      finalize_product_decision: false,
      override_product_decision: false,
      close_expedition: false,
    },
    sync_status: "synced",
    outputs: policy.required_outputs.map((output) => ({
      output_id: output.output_id,
      required: output.required,
      confirmed: false,
      evidence_refs: [],
      confirmed_by: null,
      pending_sync: false,
    })),
    stage: {
      stage_id: policy.stage_id,
      status: "active",
      next_stage_id: policy.next_stage_id,
      advance_request_status: "none",
      requested_by: null,
      can_advance: false,
      advance_blockers: [{
        code: "definition_of_done_incomplete",
        message:
          "Onboarding required outputs, tasks and acknowledgements are incomplete",
      }],
    },
    super_admin: {
      enabled: true,
      scope: "expedition",
      server_confirmation_required: true,
      can_delete_events: false,
      can_impersonate_system_clock: false,
    },
    decision: null,
    gamification_summary: null,
    expedition_status: "active",
    expedition_completion: null,
    completion_readiness: {
      state: "unavailable",
      can_close_expedition: false,
      final_stage_id: null,
      final_day_number: null,
      shore_package_ref: null,
      expected_projection_version: input.context.projection_version + 1,
      blockers: [],
    },
  };
}

async function reduceBoundary(
  input: Day1BoundaryInput,
  policy: Day1BoundaryRuntime["day1_policy"],
): Promise<PreparedCommandResult> {
  if (
    input.command.command_type !== "process_day_boundary" ||
    input.command.actor_id !== "system_clock" ||
    input.command.actor_role !== "system_clock" ||
    input.actor_id !== "system_clock" || input.actor_role !== "system_clock"
  ) {
    return rejected(
      "system_actor_not_allowed",
      "The Day boundary requires the trusted system_clock actor.",
    );
  }
  const payloadKeys = Object.keys(input.command.payload).sort();
  if (
    payloadKeys.length !== 2 || payloadKeys[0] !== "boundary_at" ||
    payloadKeys[1] !== "local_calendar_date" ||
    input.command.day_number != null || input.command.stage_id != null ||
    input.command.day_revision != null || input.command.device_id != null
  ) {
    return rejected(
      "validation_failed",
      "process_day_boundary requires only local_calendar_date and boundary_at.",
    );
  }
  if (input.context.actor !== null) {
    return rejected(
      "system_actor_not_allowed",
      "System context cannot contain a human actor.",
    );
  }
  if (input.context.expedition_status !== "active") {
    return rejected("expedition_not_active", "The Expedition is not active.");
  }
  if (input.context.active_stage_id !== policy.stage_id) {
    return rejected("stage_not_open", "The onboarding Stage is not active.");
  }
  if (
    input.context.projections.some((document) =>
      document.projection_type === "today_view" ||
      document.projection_type === "captain_day_view"
    )
  ) {
    return rejected("active_day_already_exists", "Day 1 projections already exist.");
  }

  const localDate = input.command.payload.local_calendar_date;
  const boundaryAt = input.command.payload.boundary_at;
  if (typeof localDate !== "string" || typeof boundaryAt !== "string") {
    return rejected("validation_failed", "The boundary payload is invalid.");
  }
  const compactDate = localDate.replaceAll("-", "");
  const expectedCommandId =
    `cmd_day_boundary_${input.context.expedition_key}_${compactDate}`;
  if (
    input.command.command_id !== expectedCommandId ||
    input.command.idempotency_key !== expectedCommandId
  ) {
    return rejected(
      "validation_failed",
      "The boundary command identity is not deterministic.",
    );
  }

  const boundaryDate = new Date(boundaryAt);
  const receivedDate = new Date(input.received_at);
  const startedDate = input.context.expedition_started_at
    ? new Date(input.context.expedition_started_at)
    : null;
  if (
    Number.isNaN(boundaryDate.getTime()) || Number.isNaN(receivedDate.getTime()) ||
    (startedDate && Number.isNaN(startedDate.getTime()))
  ) return rejected("boundary_date_mismatch", "Boundary timestamps are invalid.");
  const boundaryLocal = formatInTimeZone(
    boundaryDate,
    input.context.expedition_timezone,
  );
  const receivedLocal = formatInTimeZone(
    receivedDate,
    input.context.expedition_timezone,
  );
  if (
    !boundaryLocal || !receivedLocal || boundaryLocal.date !== localDate ||
    boundaryLocal.time !== input.context.day_boundary_local_time ||
    receivedLocal.date !== localDate
  ) {
    return rejected(
      "boundary_date_mismatch",
      "The boundary does not match the Expedition local date and time.",
    );
  }
  if (receivedDate.getTime() < boundaryDate.getTime()) {
    return rejected(
      "local_boundary_not_reached",
      "The local Day boundary has not been reached.",
    );
  }
  if (startedDate && receivedDate.getTime() < startedDate.getTime()) {
    return rejected(
      "local_boundary_not_reached",
      "The boundary cannot precede Expedition start.",
    );
  }

  const setup = setupView(input);
  if (
    !setup || setup.expedition_id !== input.context.expedition_key ||
    setup.expedition_status !== "active" ||
    setup.expected_projection_version !== input.context.projection_version ||
    setup.rotation.status !== "generated" ||
    typeof setup.rotation.rotation_id !== "string" ||
    setup.rotation.rules_version !== policy.rotation_rules_version
  ) {
    return rejected(
      "scheduled_assignments_unresolvable",
      "The Day 1 team and Rotation Plan are unavailable or incompatible.",
    );
  }

  const ordered = setup.participants.filter((participant) =>
    participant.status === "active"
  ).sort((left, right) => left.participant_order - right.participant_order);
  const participantIds = ordered.map((participant) => participant.participant_id);
  const assignmentMap = new Map(
    setup.rotation.assignments.map((assignment) => [
      assignment.participant_id,
      assignment,
    ]),
  );
  if (
    ordered.length < 3 || ordered.length > 5 ||
    new Set(participantIds).size !== ordered.length ||
    assignmentMap.size !== ordered.length ||
    participantIds.some((participantId) => !assignmentMap.has(participantId))
  ) {
    return rejected(
      "scheduled_assignments_unresolvable",
      "The Day 1 Rotation Plan does not cover the active team.",
    );
  }

  const assignmentInstances: JsonObject[] = [];
  const bundles: JsonObject[] = [];
  const cardsByParticipant = new Map<string, BoundaryCardDefinition[]>();
  const mutations: PreparedProjectionMutation[] = [];
  for (const participant of ordered) {
    const scheduled = assignmentMap.get(participant.participant_id)!;
    const cards = cardsFor(
      policy,
      scheduled.product_role_id,
      scheduled.onboard_role_id,
    );
    if (
      !cards || !policy.product_role_titles[scheduled.product_role_id] ||
      !policy.onboard_role_titles[scheduled.onboard_role_id]
    ) {
      return rejected(
        "card_bundle_unresolvable",
        "Pinned Day 1 role or Card content cannot be resolved.",
      );
    }
    cardsByParticipant.set(participant.participant_id, cards);
    const productAssignmentId =
      `assignment_day_01_${participant.participant_id}_product`;
    const onboardAssignmentId =
      `assignment_day_01_${participant.participant_id}_onboard`;
    assignmentInstances.push({
      assignment_id: productAssignmentId,
      participant_id: participant.participant_id,
      role_type: "product",
      role_id: scheduled.product_role_id,
      state: "active",
      day_number: 1,
      stage_id: policy.stage_id,
    });
    assignmentInstances.push({
      assignment_id: onboardAssignmentId,
      participant_id: participant.participant_id,
      role_type: "onboard",
      role_id: scheduled.onboard_role_id,
      state: "active",
      day_number: 1,
      stage_id: policy.stage_id,
    });
    const taskIds = cards.filter((card) => card.type === "task").map((card) =>
      card.card_id
    );
    bundles.push({
      bundle_id: `bundle_day_01_${participant.participant_id}`,
      participant_id: participant.participant_id,
      product_assignment_id: productAssignmentId,
      onboard_assignment_id: onboardAssignmentId,
      card_ids: cards.map((card) => card.card_id),
      task_ids: taskIds,
      output_ids: policy.required_outputs.map((output) => output.output_id),
    });
    mutations.push(mutation(
      `today_view:${participant.participant_id}`,
      "today_view",
      participant.participant_id,
      DAY1_TODAY_VIEW_SCHEMA_ID,
      todayView(input, participant, scheduled, cards, policy, localDate),
    ));
  }
  mutations.push(mutation(
    "captain_day_view",
    "captain_day_view",
    null,
    DAY1_CAPTAIN_VIEW_SCHEMA_ID,
    captainView(
      input,
      ordered,
      assignmentMap,
      cardsByParticipant,
      policy,
      localDate,
      boundaryAt,
    ),
  ));

  return {
    status: "accepted",
    events: [
      event(input, 1, "day.started", {
        day_number: 1,
        calendar_date: localDate,
        stage_id: policy.stage_id,
        boundary_at: boundaryAt,
        day_revision: 1,
        transition_mode: "automatic",
      }),
      event(input, 2, "role_assignments.activated", {
        day_number: 1,
        stage_id: policy.stage_id,
        assignments: assignmentInstances,
      }),
      event(input, 3, "card_bundles.published", {
        day_number: 1,
        stage_id: policy.stage_id,
        bundles,
      }),
    ],
    projection_mutations: mutations,
    rejection: null,
  };
}

export function isDay1BoundaryRuntime(
  runtime: RuntimeBundle,
): runtime is Day1BoundaryRuntime {
  return "day1_policy" in runtime && "reduceBoundary" in runtime &&
    typeof (runtime as Day1BoundaryRuntime).reduceBoundary === "function";
}

export function createDay1BoundaryRuntime(
  metadata: Day1BoundaryReleaseMetadata,
): Day1BoundaryRuntime {
  const policy = {
    day_number: metadata.day_number,
    stage_id: metadata.stage_id,
    stage_title: metadata.stage_title,
    next_stage_id: metadata.next_stage_id,
    rotation_rules_version: metadata.rotation_rules_version,
    product_role_titles: structuredClone(metadata.product_role_titles),
    onboard_role_titles: structuredClone(metadata.onboard_role_titles),
    shared_cards: structuredClone(metadata.shared_cards),
    product_role_cards: structuredClone(metadata.product_role_cards),
    onboard_role_cards: structuredClone(metadata.onboard_role_cards),
    required_outputs: structuredClone(metadata.required_outputs),
  } satisfies Day1BoundaryRuntime["day1_policy"];
  assertPolicy(policy);

  return Object.freeze({
    release_key: metadata.release_key,
    git_commit_sha: metadata.git_commit_sha,
    rules_release: metadata.rules_release,
    content_release: metadata.content_release,
    reducer_version: metadata.reducer_version,
    day1_policy: Object.freeze(policy),
    resolveActorRole: async (input): Promise<ActorRole> => input.actor_role,
    reduce: async () =>
      rejected(
        "command_not_implemented_in_runtime",
        "Day 1 boundary runtime is available only through the trusted executor.",
      ),
    reduceBoundary: async (input) => await reduceBoundary(input, policy),
  });
}
