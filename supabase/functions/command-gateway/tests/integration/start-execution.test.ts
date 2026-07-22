import { Pool } from "jsr:@db/postgres@0.19.5";
import { assertEquals, assertExists } from "jsr:@std/assert@1.0.19";

import { createExpeditionStartRuntime } from "../../../_shared/engine-runtime/expedition-start-v1.ts";
import { PostgresGatewayDatabase } from "../../../_shared/command-gateway/database.ts";
import { createCommandGatewayHandler } from "../../../_shared/command-gateway/handler.ts";
import { StaticRuntimeRegistry } from "../../../_shared/command-gateway/runtime-registry.ts";
import { createSchemaValidator } from "../../../_shared/command-gateway/schema-validation.ts";
import { PostgresStartDatabase } from "../../../_shared/command-gateway/start-database.ts";
import { createStartExecutor } from "../../../_shared/command-gateway/start.ts";
import type {
  CommandEnvelope,
  JsonValue,
  ProcessCommandResult,
} from "../../../_shared/command-gateway/types.ts";

const DB_URL = Deno.env.get("SUPABASE_DB_URL");

Deno.test({
  name:
    "start_expedition routes through gateway, rolls back atomically and replays after Captain revocation",
  ignore: !DB_URL,
  async fn() {
    const connectionString = DB_URL!;
    const captainAuthUserId = "13000000-0000-0000-0000-0000000000b1";
    const participantAuthUserIds = [
      "13000000-0000-0000-0000-0000000000b2",
      "13000000-0000-0000-0000-0000000000b3",
      "13000000-0000-0000-0000-0000000000b4",
    ];
    const expeditionId = "53000000-0000-0000-0000-0000000000b1";
    const captainMembershipId = "33000000-0000-0000-0000-0000000000b1";
    const participantMembershipIds = [
      "33000000-0000-0000-0000-0000000000b2",
      "33000000-0000-0000-0000-0000000000b3",
      "33000000-0000-0000-0000-0000000000b4",
    ];
    const participantIds = [
      "73000000-0000-0000-0000-0000000000b2",
      "73000000-0000-0000-0000-0000000000b3",
      "73000000-0000-0000-0000-0000000000b4",
    ];
    const participantKeys = participantIds.map((id) =>
      `participant_${id.replaceAll("-", "")}`
    );
    const runtimeReleaseId = "63000000-0000-0000-0000-0000000000b1";
    const captainActorId = `member_${captainMembershipId.replaceAll("-", "")}`;
    const expeditionKey = "start_gateway_integration";

    const fixturePool = new Pool(connectionString, 1, true);
    const fixture = await fixturePool.connect();
    let captainProfileId: string | null = null;
    let participantProfileIds: string[] = [];
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
          'start_gateway_integration',
          '00000000000000000000000000000000000000b1',
          'engine_v10_start_gateway_integration',
          'start_gateway_integration_v1',
          'start_gateway_integration_v1'
        )
      `;
      await fixture.queryArray`
        insert into auth.users (
          id,
          aud,
          role,
          email,
          email_confirmed_at,
          created_at,
          updated_at
        ) values
          (
            ${captainAuthUserId}::uuid,
            'authenticated',
            'authenticated',
            'captain-start-gateway@example.test',
            now(),
            now(),
            now()
          ),
          (
            ${participantAuthUserIds[0]}::uuid,
            'authenticated',
            'authenticated',
            'one-start-gateway@example.test',
            now(),
            now(),
            now()
          ),
          (
            ${participantAuthUserIds[1]}::uuid,
            'authenticated',
            'authenticated',
            'two-start-gateway@example.test',
            now(),
            now(),
            now()
          ),
          (
            ${participantAuthUserIds[2]}::uuid,
            'authenticated',
            'authenticated',
            'three-start-gateway@example.test',
            now(),
            now(),
            now()
          )
      `;
      const profiles = await fixture.queryObject<{
        auth_user_id: string;
        id: string;
      }>`
        select auth_user_id, id
        from ilka.profiles
        where auth_user_id in (
          ${captainAuthUserId}::uuid,
          ${participantAuthUserIds[0]}::uuid,
          ${participantAuthUserIds[1]}::uuid,
          ${participantAuthUserIds[2]}::uuid
        )
      `;
      captainProfileId = profiles.rows.find((row) =>
        row.auth_user_id === captainAuthUserId
      )?.id ?? null;
      participantProfileIds = participantAuthUserIds.map((authUserId) => {
        const profile = profiles.rows.find((row) => row.auth_user_id === authUserId);
        if (!profile) throw new Error("start_gateway_participant_profile_missing");
        return profile.id;
      });
      assertExists(captainProfileId);

      await fixture.queryArray`
        insert into ilka.expeditions (
          id,
          expedition_key,
          name,
          timezone,
          day_boundary_local_time,
          duration_days,
          recovery_days_available,
          status,
          runtime_release_id,
          created_by_profile_id
        ) values (
          ${expeditionId}::uuid,
          ${expeditionKey},
          'Start Gateway Integration',
          'Europe/Athens',
          '06:00',
          12,
          1,
          'ready',
          ${runtimeReleaseId}::uuid,
          ${captainProfileId}::uuid
        )
      `;
      await fixture.queryArray`
        insert into ilka.expedition_members (
          id,
          expedition_id,
          profile_id,
          role,
          status
        ) values (
          ${captainMembershipId}::uuid,
          ${expeditionId}::uuid,
          ${captainProfileId}::uuid,
          'captain',
          'active'
        )
      `;
      for (let index = 0; index < 3; index += 1) {
        await fixture.queryArray`
          insert into ilka.expedition_members (
            id,
            expedition_id,
            profile_id,
            role,
            status
          ) values (
            ${participantMembershipIds[index]}::uuid,
            ${expeditionId}::uuid,
            ${participantProfileIds[index]}::uuid,
            'participant',
            'active'
          )
        `;
        await fixture.queryArray`
          insert into ilka.participants (
            id,
            expedition_id,
            expedition_member_id,
            participant_key,
            participant_order,
            display_name,
            status
          ) values (
            ${participantIds[index]}::uuid,
            ${expeditionId}::uuid,
            ${participantMembershipIds[index]}::uuid,
            ${participantKeys[index]},
            ${index + 1},
            ${`Participant ${index + 1}`},
            'active'
          )
        `;
      }

      const setupProjection: Record<string, JsonValue> = {
        expedition_id: expeditionKey,
        expedition_status: "ready",
        team: {
          active_participant_count: 3,
          pending_invitation_count: 0,
          minimum: 3,
          maximum: 5,
          slots_remaining: 2,
        },
        participants: participantKeys.map((participantKey, index) => ({
          participant_id: participantKey,
          display_name: `Participant ${index + 1}`,
          participant_order: index + 1,
          status: "active",
        })),
        invitations: [],
        rotation: {
          status: "generated",
          rotation_id: "rotation_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          rules_version: 2,
          assignments: [
            {
              participant_id: participantKeys[0],
              product_role_id: "product_captain",
              onboard_role_id: "navigation",
            },
            {
              participant_id: participantKeys[1],
              product_role_id: "product_support",
              onboard_role_id: "mooring",
            },
            {
              participant_id: participantKeys[2],
              product_role_id: "product_support",
              onboard_role_id: "cook",
            },
          ],
        },
        readiness: {
          can_generate_rotation: false,
          can_start_expedition: true,
          blockers: [],
        },
        controls: {
          invite_participant: false,
          revoke_invitation: false,
          generate_rotation: false,
          start_expedition: true,
        },
        expected_projection_version: 1,
        sync_status: "synced",
      };
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
        ) values (
          ${expeditionId}::uuid,
          'expedition_setup_view',
          'expedition_setup_view',
          null,
          'https://ilka.local/schemas/expedition-setup-view.schema.json',
          '1',
          ${JSON.stringify(setupProjection)}::jsonb,
          1,
          0,
          ${runtimeReleaseId}::uuid,
          'start_gateway_integration_v1',
          '2026-07-22T07:35:00Z'::timestamptz
        )
      `;
      await fixture.queryArray`
        update ilka.projection_heads
        set current_projection_version = 1,
            updated_at = '2026-07-22T07:35:00Z'::timestamptz
        where expedition_id = ${expeditionId}::uuid
      `;
    } finally {
      fixture.release();
      await fixturePool.end();
    }

    const runtime = createExpeditionStartRuntime({
      release_key: "start_gateway_integration",
      git_commit_sha: "00000000000000000000000000000000000000b1",
      rules_release: "engine_v10_start_gateway_integration",
      content_release: "start_gateway_integration_v1",
      reducer_version: "start_gateway_integration_v1",
      team_size_min: 3,
      team_size_max: 5,
      first_stage_id: "onboarding",
      rotation_rules_version: 2,
      product_captain_role: "product_captain",
      product_support_role: "product_support",
      cook_role: "cook",
    });
    const schemas = createSchemaValidator();
    const runtimes = new StaticRuntimeRegistry([runtime]);
    const gatewayDatabase = new PostgresGatewayDatabase(connectionString);
    const startDatabase = new PostgresStartDatabase(connectionString);
    const startExecutor = createStartExecutor({
      database: startDatabase,
      contextDatabase: gatewayDatabase,
      schemas,
      runtimes,
      now: () => new Date("2026-07-22T07:40:01Z"),
    });
    const handler = createCommandGatewayHandler(
      {
        auth: { verify: async () => ({ id: captainAuthUserId }) },
        database: gatewayDatabase,
        schemas,
        runtimes,
        allowedOrigins: new Set(["http://localhost:5173"]),
        now: () => new Date("2026-07-22T07:40:01Z"),
        requestId: () => crypto.randomUUID(),
      },
      undefined,
      undefined,
      undefined,
      startExecutor,
    );

    const startCommand: CommandEnvelope = {
      command_id: "cmd_start_gateway_execute",
      command_type: "start_expedition",
      issued_at: "2026-07-22T07:40:00Z",
      actor_id: captainActorId,
      actor_role: "captain",
      expedition_id: expeditionKey,
      idempotency_key: "cmd_start_gateway_execute",
      day_number: null,
      stage_id: null,
      day_revision: null,
      payload: {},
    };
    const request = (current: CommandEnvelope) =>
      new Request("http://localhost/functions/v1/command-gateway", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer integration-session",
          origin: "http://localhost:5173",
        },
        body: JSON.stringify(current),
      });

    try {
      const spoofedResponse = await handler(request({
        ...startCommand,
        command_id: "cmd_start_gateway_spoofed",
        idempotency_key: "cmd_start_gateway_spoofed",
        actor_id: "member_spoofed",
      }));
      assertEquals(spoofedResponse.status, 403);
      const spoofedBody = await spoofedResponse.json() as {
        error: { code: string };
      };
      assertEquals(spoofedBody.error.code, "actor_spoofing_detected");

      const failurePool = new Pool(connectionString, 1, true);
      const failureFixture = await failurePool.connect();
      try {
        await failureFixture.queryArray`
          create or replace function private.fail_start_gateway_status_update()
          returns trigger
          language plpgsql
          set search_path = ''
          as $$
          begin
            if new.id = '53000000-0000-0000-0000-0000000000b1'::uuid and new.status = 'active' then
              raise exception using message = 'forced_start_status_failure';
            end if;
            return new;
          end;
          $$
        `;
        await failureFixture.queryArray`
          create trigger fail_start_gateway_status_update
          before update of status on ilka.expeditions
          for each row
          execute function private.fail_start_gateway_status_update()
        `;
      } finally {
        failureFixture.release();
        await failurePool.end();
      }

      const failedResponse = await handler(request(startCommand));
      assertEquals(failedResponse.status, 503);
      const failedBody = await failedResponse.json() as {
        error: { code: string };
      };
      assertEquals(failedBody.error.code, "start_persistence_unavailable");

      const rollbackPool = new Pool(connectionString, 1, true);
      const rollback = await rollbackPool.connect();
      try {
        const state = await rollback.queryObject<{
          event_count: number;
          projection_status: string;
          projection_version: number;
          receipt_count: number;
          status: string;
        }>`
          select
            expedition.status,
            document.projection_json ->> 'expedition_status' as projection_status,
            document.projection_version::integer as projection_version,
            (
              select count(*)::integer
              from ilka.event_log
              where expedition_id = ${expeditionId}::uuid
                and command_id = ${startCommand.command_id}
            ) as event_count,
            (
              select count(*)::integer
              from ilka.command_receipts
              where expedition_id = ${expeditionId}::uuid
                and command_id = ${startCommand.command_id}
            ) as receipt_count
          from ilka.expeditions as expedition
          join ilka.projection_documents as document
            on document.expedition_id = expedition.id
           and document.projection_key = 'expedition_setup_view'
          where expedition.id = ${expeditionId}::uuid
        `;
        assertEquals(state.rows[0], {
          status: "ready",
          projection_status: "ready",
          projection_version: 1,
          event_count: 0,
          receipt_count: 0,
        });
        await rollback.queryArray`
          drop trigger fail_start_gateway_status_update on ilka.expeditions
        `;
        await rollback.queryArray`
          drop function private.fail_start_gateway_status_update()
        `;
      } finally {
        rollback.release();
        await rollbackPool.end();
      }

      const firstResponse = await handler(request(startCommand));
      assertEquals(firstResponse.status, 200);
      const firstBody = await firstResponse.json() as {
        data: ProcessCommandResult;
      };
      assertEquals(firstBody.data.outcome, "accepted");
      assertEquals(firstBody.data.replayed, false);
      assertEquals(firstBody.data.receipt.event_ids.length, 2);
      assertEquals(firstBody.data.receipt.stream_position, 2);
      assertEquals(firstBody.data.receipt.projection_version, 2);

      const verificationPool = new Pool(connectionString, 1, true);
      const verification = await verificationPool.connect();
      try {
        const expedition = await verification.queryObject<{ status: string }>`
          select status
          from ilka.expeditions
          where id = ${expeditionId}::uuid
        `;
        assertEquals(expedition.rows[0]?.status, "active");

        const events = await verification.queryObject<{ event_type: string }>`
          select event_type
          from ilka.event_log
          where expedition_id = ${expeditionId}::uuid
            and command_id = ${startCommand.command_id}
          order by stream_position
        `;
        assertEquals(events.rows.map((row) => row.event_type), [
          "expedition.started",
          "stage.opened",
        ]);

        const projection = await verification.queryObject<{
          projection_json: Record<string, JsonValue>;
          projection_version: number;
        }>`
          select
            projection_json,
            projection_version::integer as projection_version
          from ilka.projection_documents
          where expedition_id = ${expeditionId}::uuid
            and projection_key = 'expedition_setup_view'
        `;
        assertEquals(projection.rows[0]?.projection_version, 2);
        const setupView = projection.rows[0]?.projection_json;
        assertExists(setupView);
        assertEquals(setupView.expedition_status, "active");
        assertEquals(
          (setupView.controls as Record<string, JsonValue>).start_expedition,
          false,
        );

        const dayState = await verification.queryObject<{
          day_event_count: number;
          day_projection_count: number;
        }>`
          select
            (
              select count(*)::integer
              from ilka.event_log
              where expedition_id = ${expeditionId}::uuid
                and event_type = 'day.started'
            ) as day_event_count,
            (
              select count(*)::integer
              from ilka.projection_documents
              where expedition_id = ${expeditionId}::uuid
                and projection_type in ('today_view', 'captain_day_view')
            ) as day_projection_count
        `;
        assertEquals(dayState.rows[0], {
          day_event_count: 0,
          day_projection_count: 0,
        });

        await verification.queryArray`
          update ilka.expedition_members
          set status = 'revoked',
              revoked_at = now(),
              revoke_reason = 'Gate 9D2B replay proof'
          where id = ${captainMembershipId}::uuid
        `;
      } finally {
        verification.release();
        await verificationPool.end();
      }

      const replayResponse = await handler(request(startCommand));
      assertEquals(replayResponse.status, 200);
      const replayBody = await replayResponse.json() as {
        data: ProcessCommandResult;
      };
      assertEquals(replayBody.data.replayed, true);
      assertEquals(replayBody.data.receipt.command_id, startCommand.command_id);
      assertEquals(replayBody.data.receipt.event_ids.length, 2);
    } finally {
      await gatewayDatabase.close();
      await startDatabase.close();
    }
  },
});
