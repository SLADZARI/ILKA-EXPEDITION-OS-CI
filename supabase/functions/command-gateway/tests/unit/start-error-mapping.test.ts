import { assertEquals } from "jsr:@std/assert@1.0.19";

import type { StartDatabase } from "../../../_shared/command-gateway/start-database.ts";
import { createStartExecutor } from "../../../_shared/command-gateway/start.ts";
import { StaticRuntimeRegistry } from "../../../_shared/command-gateway/runtime-registry.ts";
import { createSchemaValidator } from "../../../_shared/command-gateway/schema-validation.ts";
import type {
  CommandEnvelope,
  GatewayDatabase,
  GatewayExecutionContext,
  JsonValue,
  ProcessCommandResult,
  RuntimeBundle,
} from "../../../_shared/command-gateway/types.ts";

const AUTH_USER_ID = "10000000-0000-0000-0000-0000000000ea";
const PROFILE_ID = "20000000-0000-0000-0000-0000000000ea";
const MEMBERSHIP_ID = "30000000-0000-0000-0000-0000000000ea";
const EXPEDITION_ID = "50000000-0000-0000-0000-0000000000ea";
const RELEASE_ID = "60000000-0000-0000-0000-0000000000ea";
const ACTOR_ID = `member_${MEMBERSHIP_ID.replaceAll("-", "")}`;

const release = {
  id: RELEASE_ID,
  release_key: "start_error_mapping_test",
  git_commit_sha: "00000000000000000000000000000000000000ea",
  rules_release: "start_error_mapping_rules",
  content_release: "start_error_mapping_content",
  reducer_version: "start_error_mapping_v1",
};

const participants = [1, 2, 3].map((index) => ({
  participant_id: `participant_${index.toString(16).padStart(32, "0")}`,
  display_name: `Participant ${index}`,
  participant_order: index,
  status: "active",
}));

const activeSetupProjection: Record<string, JsonValue> = {
  expedition_id: "start_error_mapping_test",
  expedition_status: "active",
  team: {
    active_participant_count: 3,
    pending_invitation_count: 0,
    minimum: 3,
    maximum: 5,
    slots_remaining: 2,
  },
  participants,
  invitations: [],
  rotation: {
    status: "generated",
    rotation_id: "rotation_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    rules_version: 2,
    assignments: [
      {
        participant_id: participants[0].participant_id,
        product_role_id: "product_captain",
        onboard_role_id: "navigation",
      },
      {
        participant_id: participants[1].participant_id,
        product_role_id: "product_support",
        onboard_role_id: "mooring",
      },
      {
        participant_id: participants[2].participant_id,
        product_role_id: "product_support",
        onboard_role_id: "cook",
      },
    ],
  },
  readiness: {
    can_generate_rotation: false,
    can_start_expedition: false,
    blockers: [],
  },
  controls: {
    invite_participant: false,
    revoke_invitation: false,
    generate_rotation: false,
    start_expedition: false,
  },
  expected_projection_version: 6,
  sync_status: "synced",
};

const runtime: RuntimeBundle & {
  start_policy: {
    team_size_min: number;
    team_size_max: number;
    first_stage_id: string;
    rotation_rules_version: number;
    product_captain_role: string;
    product_support_role: string;
    cook_role: string;
  };
} = {
  ...release,
  start_policy: {
    team_size_min: 3,
    team_size_max: 5,
    first_stage_id: "onboarding",
    rotation_rules_version: 2,
    product_captain_role: "product_captain",
    product_support_role: "product_support",
    cook_role: "cook",
  },
  resolveActorRole: async (input) => input.actor_role,
  reduce: async (input) => ({
    status: "accepted",
    events: [
      {
        event_id: "evt_start_error_mapping_01",
        event_type: "expedition.started",
        occurred_at: input.command.issued_at,
        recorded_at: input.received_at,
        actor_id: ACTOR_ID,
        actor_role: "captain",
        expedition_id: "start_error_mapping_test",
        day_number: null,
        stage_id: null,
        day_revision: null,
        command_id: input.command.command_id,
        idempotency_key: input.command.command_id,
        schema_version: 1,
        payload: {},
      },
      {
        event_id: "evt_start_error_mapping_02",
        event_type: "stage.opened",
        occurred_at: input.command.issued_at,
        recorded_at: input.received_at,
        actor_id: ACTOR_ID,
        actor_role: "captain",
        expedition_id: "start_error_mapping_test",
        day_number: null,
        stage_id: "onboarding",
        day_revision: null,
        command_id: input.command.command_id,
        idempotency_key: input.command.command_id,
        schema_version: 1,
        payload: { stage_id: "onboarding" },
      },
    ],
    projection_mutations: [
      {
        operation: "upsert",
        projection_key: "expedition_setup_view",
        projection_type: "expedition_setup_view",
        subject_id: null,
        schema_id: "https://ilka.local/schemas/expedition-setup-view.schema.json",
        schema_version: "1",
        projection: activeSetupProjection,
      },
    ],
    rejection: null,
  }),
};

const context: GatewayExecutionContext = {
  expedition_id: EXPEDITION_ID,
  expedition_key: "start_error_mapping_test",
  expedition_status: "ready",
  stream_position: 9,
  projection_version: 5,
  runtime_release: release,
  actor: {
    auth_user_id: AUTH_USER_ID,
    profile_id: PROFILE_ID,
    membership_id: MEMBERSHIP_ID,
    participant_id: null,
    participant_key: null,
    membership_role: "captain",
  },
  projections: [],
};

const command: CommandEnvelope = {
  command_id: "cmd_start_error_mapping",
  command_type: "start_expedition",
  issued_at: "2026-07-22T07:20:00+03:00",
  actor_id: ACTOR_ID,
  actor_role: "captain",
  expedition_id: "start_error_mapping_test",
  idempotency_key: "cmd_start_error_mapping",
  day_number: null,
  stage_id: null,
  day_revision: null,
  payload: {},
};

Deno.test("start executor preserves missing setup projection race as 409", async () => {
  const startDatabase: StartDatabase = {
    startExpedition: async (): Promise<ProcessCommandResult> => {
      throw new Error("expedition_setup_projection_missing");
    },
  };
  const contextDatabase: GatewayDatabase = {
    getReceipt: async () => null,
    loadContext: async () => context,
    processCommand: async () => {
      throw new Error("generic processCommand must not be called");
    },
  };
  const executor = createStartExecutor({
    database: startDatabase,
    contextDatabase,
    schemas: createSchemaValidator(),
    runtimes: new StaticRuntimeRegistry([runtime]),
    now: () => new Date("2026-07-22T04:20:01Z"),
  });

  const outcome = await executor.execute({
    command,
    auth_user: { id: AUTH_USER_ID },
    request_hash: "c".repeat(64),
  });

  assertEquals(outcome.ok, false);
  if (!outcome.ok) {
    assertEquals(outcome.code, "expedition_setup_projection_missing");
    assertEquals(outcome.status, 409);
    assertEquals(outcome.retryable, false);
  }
});
