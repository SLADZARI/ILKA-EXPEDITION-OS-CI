import { Pool } from "jsr:@db/postgres@0.19.5";
import { assertEquals, assertExists } from "jsr:@std/assert@1.0.19";

import todayFixture from "../../../../../frontend/src/dev/today-view.day1.fixture.json" with {
  type: "json",
};
import captainFixture from "../../../../../frontend/src/dev/captain-day-view.day1.fixture.json" with {
  type: "json",
};

import { PostgresGatewayDatabase } from "../../../_shared/command-gateway/database.ts";
import { createCommandGatewayHandler } from "../../../_shared/command-gateway/handler.ts";
import { StaticRuntimeRegistry } from "../../../_shared/command-gateway/runtime-registry.ts";
import { createSchemaValidator } from "../../../_shared/command-gateway/schema-validation.ts";
import {
  CAPTAIN_DAY_VIEW_SCHEMA_ID,
  createDay1CompleteTaskRuntime,
  READ_MODEL_SCHEMA_VERSION,
  TODAY_VIEW_SCHEMA_ID,
} from "../../../_shared/engine-runtime/day1-complete-task-v1.ts";

const DB_URL = Deno.env.get("SUPABASE_DB_URL");

Deno.test({
  name: "complete_task persists an event and updates Participant/Captain projections",
  ignore: !DB_URL,
  async fn() {
    const connectionString = DB_URL!;
    const runtimeReleaseId = "63000000-0000-0000-0000-000000000001";
    const participantAuthUserId = "13000000-0000-0000-0000-000000000001";
    const captainAuthUserId = "13000000-0000-0000-0000-000000000002";
    const expeditionId = "53000000-0000-0000-0000-000000000001";
    const participantMembershipId = "33000000-0000-0000-0000-000000000001";
    const captainMembershipId = "33000000-0000-0000-0000-000000000002";
    const participantId = "43000000-0000-0000-0000-000000000001";

    const runtime = createDay1CompleteTaskRuntime({
      release_key: "day1_complete_task_integration",
      git_commit_sha: "0000000000000000000000000000000000000021",
      rules_release: "engine_v8_permissions_v7_onboarding_v3",
      content_release: "day1_content_v1",
      reducer_version: "day1_complete_task_v1",
    });

    const fixturePool = new Pool(connectionString, 1, true);
    const fixture = await fixturePool.connect();
    try {
      await fixture.queryArray`
        insert into ilka.runtime_releases (
          id,
          release_key,
          git_commit_sha,
          rules_release,
          content_release,
          reducer_version
        ) values (
          ${runtimeReleaseId}::uuid,
          ${runtime.release_key},
          ${runtime.git_commit_sha},
          ${runtime.rules_release},
          ${runtime.content_release},
          ${runtime.reducer_version}
        )
      `;
      await fixture.queryArray`
        insert into auth.users (id, aud, role, email, created_at, updated_at)
        values
          (
            ${participantAuthUserId}::uuid,
            'authenticated',
            'authenticated',
            'day1-participant@example.test',
            now(),
            now()
          ),
          (
            ${captainAuthUserId}::uuid,
            'authenticated',
            'authenticated',
            'day1-captain@example.test',
            now(),
            now()
          )
      `;

      const participantProfile = await fixture.queryObject<{ id: string }>`
        select id from ilka.profiles
        where auth_user_id = ${participantAuthUserId}::uuid
      `;
      const captainProfile = await fixture.queryObject<{ id: string }>`
        select id from ilka.profiles
        where auth_user_id = ${captainAuthUserId}::uuid
      `;
      const participantProfileId = participantProfile.rows[0]?.id;
      const captainProfileId = captainProfile.rows[0]?.id;
      assertExists(participantProfileId);
      assertExists(captainProfileId);

      await fixture.queryArray`
        insert into ilka.expeditions (
          id,
          expedition_key,
          name,
          timezone,
          status,
          runtime_release_id,
          created_by_profile_id
        ) values (
          ${expeditionId}::uuid,
          'day1_complete_task_integration',
          'Day 1 Complete Task Integration',
          'Europe/Athens',
          'active',
          ${runtimeReleaseId}::uuid,
          ${captainProfileId}::uuid
        )
      `;
      await fixture.queryArray`
        insert into ilka.expedition_members (
          id,
          expedition_id,
          profile_id,
          role
        ) values
          (
            ${participantMembershipId}::uuid,
            ${expeditionId}::uuid,
            ${participantProfileId}::uuid,
            'participant'
          ),
          (
            ${captainMembershipId}::uuid,
            ${expeditionId}::uuid,
            ${captainProfileId}::uuid,
            'captain'
          )
      `;
      await fixture.queryArray`
        insert into ilka.participants (
          id,
          participant_key,
          expedition_id,
          expedition_member_id,
          display_name,
          participant_order
        ) values (
          ${participantId}::uuid,
          'participant_01',
          ${expeditionId}::uuid,
          ${participantMembershipId}::uuid,
          'Participant 01',
          1
        )
      `;

      await fixture.queryArray`
        update ilka.projection_heads
        set current_projection_version = 1
        where expedition_id = ${expeditionId}::uuid
      `;

      const todayJson = JSON.stringify({
        ...todayFixture,
        expedition_id: "day1_complete_task_integration",
      });
      const captainJson = JSON.stringify({
        ...captainFixture,
        expedition_id: "day1_complete_task_integration",
      });
      await fixture.queryArray`
        insert into ilka.projection_documents (
          expedition_id,
          projection_key,
          projection_type,
          subject_id,
          schema_id,
          schema_version,
          projection_json,
          projection_version,
          source_stream_position,
          runtime_release_id,
          reducer_version,
          generated_at
        ) values
          (
            ${expeditionId}::uuid,
            'today_view:participant_01',
            'today_view',
            'participant_01',
            ${TODAY_VIEW_SCHEMA_ID},
            ${READ_MODEL_SCHEMA_VERSION},
            ${todayJson}::jsonb,
            1,
            0,
            ${runtimeReleaseId}::uuid,
            ${runtime.reducer_version},
            now()
          ),
          (
            ${expeditionId}::uuid,
            'captain_day_view',
            'captain_day_view',
            null,
            ${CAPTAIN_DAY_VIEW_SCHEMA_ID},
            ${READ_MODEL_SCHEMA_VERSION},
            ${captainJson}::jsonb,
            1,
            0,
            ${runtimeReleaseId}::uuid,
            ${runtime.reducer_version},
            now()
          )
      `;
    } finally {
      fixture.release();
    }

    const database = new PostgresGatewayDatabase(connectionString);
    const handler = createCommandGatewayHandler({
      auth: { verify: async () => ({ id: participantAuthUserId }) },
      database,
      schemas: createSchemaValidator(),
      runtimes: new StaticRuntimeRegistry([runtime]),
      allowedOrigins: new Set(["http://localhost:5173"]),
      now: () => new Date("2026-07-18T15:00:05Z"),
      requestId: () => "73000000-0000-0000-0000-000000000001",
    });

    const command = {
      command_id: "cmd_day1_integration_complete_01",
      command_type: "complete_task",
      issued_at: "2026-07-18T18:00:00+03:00",
      actor_id: "participant_01",
      actor_role: "product_captain",
      expedition_id: "day1_complete_task_integration",
      idempotency_key: "cmd_day1_integration_complete_01",
      day_number: 1,
      stage_id: "onboarding",
      device_id: "integration_device",
      payload: { task_id: "task_team_agreement" },
    };

    try {
      const response = await handler(new Request(
        "http://localhost/functions/v1/command-gateway",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer integration-session",
            origin: "http://localhost:5173",
          },
          body: JSON.stringify(command),
        },
      ));
      assertEquals(response.status, 200);
      const body = await response.json();
      assertEquals(body.data.outcome, "accepted");
      assertEquals(body.data.replayed, false);
      assertEquals(body.data.receipt.stream_position, 1);
      assertEquals(body.data.receipt.projection_version, 2);
      assertEquals(body.data.receipt.event_ids, ["evt_day1_integration_complete_01_01"]);

      const replay = await handler(new Request(
        "http://localhost/functions/v1/command-gateway",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer integration-session",
            origin: "http://localhost:5173",
          },
          body: JSON.stringify(command),
        },
      ));
      assertEquals(replay.status, 200);
      const replayBody = await replay.json();
      assertEquals(replayBody.data.replayed, true);

      const verify = await fixturePool.connect();
      try {
        const counts = await verify.queryObject<{
          receipt_count: number | string;
          event_count: number | string;
          stream_position: number | string;
          projection_version: number | string;
        }>`
          select
            (select count(*) from ilka.command_receipts where expedition_id = ${expeditionId}::uuid) as receipt_count,
            (select count(*) from ilka.event_log where expedition_id = ${expeditionId}::uuid) as event_count,
            (select current_stream_position from ilka.stream_heads where expedition_id = ${expeditionId}::uuid) as stream_position,
            (select current_projection_version from ilka.projection_heads where expedition_id = ${expeditionId}::uuid) as projection_version
        `;
        assertEquals(Number(counts.rows[0].receipt_count), 1);
        assertEquals(Number(counts.rows[0].event_count), 1);
        assertEquals(Number(counts.rows[0].stream_position), 1);
        assertEquals(Number(counts.rows[0].projection_version), 2);

        const event = await verify.queryObject<{
          event_type: string;
          participant_id: string;
        }>`
          select
            event_type,
            event_json #>> '{payload,participant_id}' as participant_id
          from ilka.event_log
          where expedition_id = ${expeditionId}::uuid
        `;
        assertEquals(event.rows[0].event_type, "task.completed");
        assertEquals(event.rows[0].participant_id, "participant_01");

        await verify.queryArray`
          select set_config('request.jwt.claim.sub', ${participantAuthUserId}, false)
        `;
        const today = await verify.queryObject<{ projection: Record<string, unknown> }>`
          select api.get_today_view('day1_complete_task_integration') as projection
        `;
        const todayTasks = today.rows[0].projection.tasks as Array<Record<string, unknown>>;
        assertEquals(todayTasks[0].status, "completed");

        const receipt = await verify.queryObject<{ result: Record<string, unknown> }>`
          select api.get_command_receipt('cmd_day1_integration_complete_01') as result
        `;
        assertEquals(receipt.rows[0].result.outcome, "accepted");
        assertEquals(receipt.rows[0].result.replayed, true);

        await verify.queryArray`
          select set_config('request.jwt.claim.sub', ${captainAuthUserId}, false)
        `;
        const captain = await verify.queryObject<{ projection: Record<string, unknown> }>`
          select api.get_captain_day_view('day1_complete_task_integration') as projection
        `;
        const participants = captain.rows[0].projection.participants as Array<Record<string, unknown>>;
        assertEquals(participants[0].required_tasks_terminal, true);
        assertEquals(
          (captain.rows[0].projection.day as Record<string, unknown>).revision,
          2,
        );
      } finally {
        verify.release();
      }
    } finally {
      await database.close();
      await fixturePool.end();
    }
  },
});
