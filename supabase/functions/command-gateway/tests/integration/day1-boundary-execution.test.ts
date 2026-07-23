import { Pool } from "jsr:@db/postgres@0.19.5";
import { assertEquals, assertExists } from "jsr:@std/assert@1.0.19";

import { createDay1BoundaryRuntime } from "../../../_shared/engine-runtime/day1-boundary-v1.ts";
import { createExpeditionStartRuntime } from "../../../_shared/engine-runtime/expedition-start-v1.ts";
import { PostgresDayBoundaryDatabase } from "../../../_shared/command-gateway/day-boundary-database.ts";
import { createDayBoundaryExecutor } from "../../../_shared/command-gateway/day-boundary.ts";
import { PostgresGatewayDatabase } from "../../../_shared/command-gateway/database.ts";
import { createCommandGatewayHandler } from "../../../_shared/command-gateway/handler.ts";
import { StaticRuntimeRegistry } from "../../../_shared/command-gateway/runtime-registry.ts";
import { createSchemaValidator } from "../../../_shared/command-gateway/schema-validation.ts";
import { PostgresStartDatabase } from "../../../_shared/command-gateway/start-database.ts";
import { createStartExecutor } from "../../../_shared/command-gateway/start.ts";
import { createSystemClockRequestVerifier } from "../../../_shared/command-gateway/system-clock-auth.ts";
import type {
  CommandEnvelope,
  JsonValue,
  ProcessCommandResult,
  RuntimeBundle,
} from "../../../_shared/command-gateway/types.ts";
import { DAY1_POLICY } from "../unit/day1-boundary-fixture.ts";

const DB_URL = Deno.env.get("SUPABASE_DB_URL");
const encoder = new TextEncoder();

async function sign(secret: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.test({
  name: "trusted Day 1 boundary catches up, rolls back atomically and replays exactly",
  ignore: !DB_URL,
  async fn() {
    const connectionString = DB_URL!;
    const release = {
      id: "68000000-0000-0000-0000-0000000000d3",
      release_key: "day1_boundary_integration",
      git_commit_sha: "00000000000000000000000000000000000008d3",
      rules_release: "engine_v10_day1_boundary_integration",
      content_release: "day1_boundary_integration_v1",
      reducer_version: "day1_boundary_integration_v1",
    };
    const captainAuthUserId = "18000000-0000-0000-0000-0000000000d1";
    const participantAuthUserIds = [
      "18000000-0000-0000-0000-0000000000d2",
      "18000000-0000-0000-0000-0000000000d3",
      "18000000-0000-0000-0000-0000000000d4",
    ];
    const expeditionId = "58000000-0000-0000-0000-0000000000d1";
    const expeditionKey = "day1_boundary_integration";
    const captainMembershipId = "38000000-0000-0000-0000-0000000000d1";
    const participantMembershipIds = [
      "38000000-0000-0000-0000-0000000000d2",
      "38000000-0000-0000-0000-0000000000d3",
      "38000000-0000-0000-0000-0000000000d4",
    ];
    const participantIds = [
      "78000000-0000-0000-0000-0000000000d2",
      "78000000-0000-0000-0000-0000000000d3",
      "78000000-0000-0000-0000-0000000000d4",
    ];
    const participantKeys = participantIds.map((id) =>
      `participant_${id.replaceAll("-", "")}`
    );
    const captainActorId = `member_${captainMembershipId.replaceAll("-", "")}`;

    const fixturePool = new Pool(connectionString, 1, true);
    const fixture = await fixturePool.connect();
    let captainProfileId: string | null = null;
    let participantProfileIds: string[] = [];
    try {
      await fixture.queryArray`
        insert into ilka.runtime_releases (
          id, release_key, git_commit_sha, rules_release, content_release, reducer_version
        ) values (
          ${release.id}::uuid,
          ${release.release_key},
          ${release.git_commit_sha},
          ${release.rules_release},
          ${release.content_release},
          ${release.reducer_version}
        )
      `;
      await fixture.queryArray`
        insert into auth.users (
          id, aud, role, email, email_confirmed_at, created_at, updated_at
        ) values
          (${captainAuthUserId}::uuid, 'authenticated', 'authenticated', 'captain-boundary@example.test', now(), now(), now()),
          (${
        participantAuthUserIds[0]
      }::uuid, 'authenticated', 'authenticated', 'one-boundary@example.test', now(), now(), now()),
          (${
        participantAuthUserIds[1]
      }::uuid, 'authenticated', 'authenticated', 'two-boundary@example.test', now(), now(), now()),
          (${
        participantAuthUserIds[2]
      }::uuid, 'authenticated', 'authenticated', 'three-boundary@example.test', now(), now(), now())
      `;
      const profiles = await fixture.queryObject<{ auth_user_id: string; id: string }>`
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
        if (!profile) throw new Error("boundary_participant_profile_missing");
        return profile.id;
      });
      assertExists(captainProfileId);

      await fixture.queryArray`
        insert into ilka.expeditions (
          id, expedition_key, name, timezone, day_boundary_local_time,
          duration_days, recovery_days_available, status, runtime_release_id,
          created_by_profile_id
        ) values (
          ${expeditionId}::uuid,
          ${expeditionKey},
          'Day 1 Boundary Integration',
          'Europe/Athens',
          '06:00',
          12,
          1,
          'ready',
          ${release.id}::uuid,
          ${captainProfileId}::uuid
        )
      `;
      await fixture.queryArray`
        insert into ilka.expedition_members (
          id, expedition_id, profile_id, role, status
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
            id, expedition_id, profile_id, role, status
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
            id, expedition_id, expedition_member_id, participant_key,
            participant_order, display_name, status
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

      const participants = participantKeys.map((participantKey, index) => ({
        participant_id: participantKey,
        display_name: `Participant ${index + 1}`,
        participant_order: index + 1,
        status: "active",
      }));
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
        participants,
        invitations: [],
        rotation: {
          status: "generated",
          rotation_id: "rotation_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
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
              onboard_role_id: "order",
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
          expedition_id, projection_key, projection_type, subject_id,
          schema_id, schema_version, projection_json, projection_version,
          source_stream_position, runtime_release_id, reducer_version, generated_at
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
          ${release.id}::uuid,
          ${release.reducer_version},
          '2026-07-23T03:55:00Z'::timestamptz
        )
      `;
      await fixture.queryArray`
        update ilka.projection_heads
        set current_projection_version = 1,
            updated_at = '2026-07-23T03:55:00Z'::timestamptz
        where expedition_id = ${expeditionId}::uuid
      `;
    } finally {
      fixture.release();
      await fixturePool.end();
    }

    const startRuntime = createExpeditionStartRuntime({
      ...release,
      team_size_min: 3,
      team_size_max: 5,
      first_stage_id: "onboarding",
      rotation_rules_version: 2,
      product_captain_role: "product_captain",
      product_support_role: "product_support",
      cook_role: "cook",
    });
    const boundaryRuntime = createDay1BoundaryRuntime({
      ...DAY1_POLICY,
      ...release,
    });
    const compositeRuntime = Object.freeze({
      ...startRuntime,
      day1_policy: boundaryRuntime.day1_policy,
      reduceBoundary: boundaryRuntime.reduceBoundary,
    }) satisfies RuntimeBundle;
    const schemas = createSchemaValidator();
    const runtimes = new StaticRuntimeRegistry([compositeRuntime]);
    const gatewayDatabase = new PostgresGatewayDatabase(connectionString);
    const startDatabase = new PostgresStartDatabase(connectionString);
    const dayBoundaryDatabase = new PostgresDayBoundaryDatabase(connectionString);

    try {
      const startExecutor = createStartExecutor({
        database: startDatabase,
        contextDatabase: gatewayDatabase,
        schemas,
        runtimes,
        now: () => new Date("2026-07-23T04:00:00Z"),
      });
      const startOutcome = await startExecutor.execute({
        command: {
          command_id: "cmd_start_boundary_integration",
          command_type: "start_expedition",
          issued_at: "2026-07-23T04:00:00Z",
          actor_id: captainActorId,
          actor_role: "captain",
          expedition_id: expeditionKey,
          idempotency_key: "cmd_start_boundary_integration",
          day_number: null,
          stage_id: null,
          day_revision: null,
          payload: {},
        },
        auth_user: { id: captainAuthUserId },
        request_hash: "a".repeat(64),
      });
      assertEquals(startOutcome.ok, true);

      const boundaryNow = new Date("2026-07-23T04:05:00Z");
      const executor = createDayBoundaryExecutor({
        database: dayBoundaryDatabase,
        schemas,
        runtimes,
        now: () => boundaryNow,
      });
      const secret = "gate9d3-integration-secret";
      const verifier = createSystemClockRequestVerifier({
        secret,
        now: () => boundaryNow,
      });
      const handler = createCommandGatewayHandler(
        {
          auth: { verify: async () => null },
          database: gatewayDatabase,
          schemas,
          runtimes,
          allowedOrigins: new Set(["http://localhost:5173"]),
          now: () => boundaryNow,
          requestId: () => crypto.randomUUID(),
        },
        undefined,
        undefined,
        undefined,
        undefined,
        { verifier, executor },
      );

      const boundaryCommand: CommandEnvelope = {
        command_id: "cmd_day_boundary_day1_boundary_integration_20260723",
        command_type: "process_day_boundary",
        issued_at: "2026-07-23T04:05:00Z",
        actor_id: "system_clock",
        actor_role: "system_clock",
        expedition_id: expeditionKey,
        idempotency_key: "cmd_day_boundary_day1_boundary_integration_20260723",
        day_number: null,
        stage_id: null,
        device_id: null,
        day_revision: null,
        payload: {
          local_calendar_date: "2026-07-23",
          boundary_at: "2026-07-23T06:00:00+03:00",
        },
      };
      const body = JSON.stringify(boundaryCommand);
      const timestamp = String(Math.floor(boundaryNow.getTime() / 1000));
      const systemRequest = async () =>
        new Request(
          "http://localhost/functions/v1/command-gateway",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: "Bearer platform-service-jwt",
              "x-ilka-system-timestamp": timestamp,
              "x-ilka-system-signature": await sign(secret, timestamp, body),
            },
            body,
          },
        );

      const failurePool = new Pool(connectionString, 1, true);
      const failureFixture = await failurePool.connect();
      try {
        await failureFixture.queryArray`
          create or replace function private.fail_boundary_captain_projection()
          returns trigger
          language plpgsql
          set search_path = ''
          as $$
          begin
            if new.expedition_id = '58000000-0000-0000-0000-0000000000d1'::uuid
               and new.projection_key = 'captain_day_view' then
              raise exception using message = 'forced_boundary_projection_failure';
            end if;
            return new;
          end;
          $$
        `;
        await failureFixture.queryArray`
          create trigger fail_boundary_captain_projection
          before insert or update on ilka.projection_documents
          for each row execute function private.fail_boundary_captain_projection()
        `;
      } finally {
        failureFixture.release();
        await failurePool.end();
      }

      const failedResponse = await handler(await systemRequest());
      assertEquals(failedResponse.status, 503);
      const failedBody = await failedResponse.json();
      assertEquals(failedBody.error.code, "day_boundary_persistence_unavailable");

      const rollbackPool = new Pool(connectionString, 1, true);
      const rollback = await rollbackPool.connect();
      try {
        const state = await rollback.queryObject<{
          boundary_receipts: number;
          boundary_events: number;
          day_projections: number;
          stream_position: number;
          projection_version: number;
        }>`
          select
            (select count(*)::integer from ilka.command_receipts where command_id = ${boundaryCommand.command_id}) as boundary_receipts,
            (select count(*)::integer from ilka.event_log where command_id = ${boundaryCommand.command_id}) as boundary_events,
            (select count(*)::integer from ilka.projection_documents where expedition_id = ${expeditionId}::uuid and projection_type in ('today_view', 'captain_day_view')) as day_projections,
            stream_head.current_stream_position::integer as stream_position,
            projection_head.current_projection_version::integer as projection_version
          from ilka.stream_heads as stream_head
          join ilka.projection_heads as projection_head using (expedition_id)
          where stream_head.expedition_id = ${expeditionId}::uuid
        `;
        assertEquals(state.rows[0], {
          boundary_receipts: 0,
          boundary_events: 0,
          day_projections: 0,
          stream_position: 2,
          projection_version: 2,
        });
        await rollback.queryArray`
          drop trigger fail_boundary_captain_projection on ilka.projection_documents
        `;
        await rollback.queryArray`
          drop function private.fail_boundary_captain_projection()
        `;
      } finally {
        rollback.release();
        await rollbackPool.end();
      }

      const acceptedResponse = await handler(await systemRequest());
      assertEquals(acceptedResponse.status, 200);
      const acceptedBody = await acceptedResponse.json() as {
        data: ProcessCommandResult;
      };
      assertEquals(acceptedBody.data.replayed, false);
      assertEquals(acceptedBody.data.receipt.stream_position, 5);
      assertEquals(acceptedBody.data.receipt.projection_version, 3);
      assertEquals(acceptedBody.data.receipt.actor_auth_user_id, null);
      assertEquals(acceptedBody.data.receipt.actor_role, "system_clock");

      const verificationPool = new Pool(connectionString, 1, true);
      const verification = await verificationPool.connect();
      try {
        const events = await verification.queryObject<{
          event_type: string;
          occurred_at: string;
          recorded_at: string;
        }>`
          select event_type, occurred_at::text, recorded_at::text
          from ilka.event_log
          where expedition_id = ${expeditionId}::uuid
            and command_id = ${boundaryCommand.command_id}
          order by stream_position
        `;
        assertEquals(events.rows.map((row) => row.event_type), [
          "day.started",
          "role_assignments.activated",
          "card_bundles.published",
        ]);
        assertEquals(
          events.rows.every((row) => row.occurred_at === row.recorded_at),
          true,
        );

        const projections = await verification.queryObject<{
          projection_key: string;
          projection_json: Record<string, JsonValue>;
        }>`
          select projection_key, projection_json
          from ilka.projection_documents
          where expedition_id = ${expeditionId}::uuid
            and projection_type in ('today_view', 'captain_day_view')
          order by projection_key
        `;
        assertEquals(projections.rows.length, 4);
        const captain = projections.rows.find((row) =>
          row.projection_key === "captain_day_view"
        );
        assertExists(captain);
        const blockers = captain.projection_json.blockers as Array<
          Record<string, JsonValue>
        >;
        assertEquals(
          blockers.some((blocker) =>
            blocker.entity_id === `${participantKeys[0]}:task_team_agreement`
          ),
          true,
        );
      } finally {
        verification.release();
        await verificationPool.end();
      }

      const replayResponse = await handler(await systemRequest());
      assertEquals(replayResponse.status, 200);
      const replayBody = await replayResponse.json() as {
        data: ProcessCommandResult;
      };
      assertEquals(replayBody.data.replayed, true);
      assertEquals(replayBody.data.receipt.event_ids.length, 3);
    } finally {
      await gatewayDatabase.close();
      await startDatabase.close();
      await dayBoundaryDatabase.close();
    }
  },
});
