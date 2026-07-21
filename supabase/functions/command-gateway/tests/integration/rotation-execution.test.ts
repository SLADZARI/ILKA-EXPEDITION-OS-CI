import { Pool } from "jsr:@db/postgres@0.19.5";
import { assertEquals, assertExists } from "jsr:@std/assert@1.0.19";

import { createExpeditionRotationRuntime } from "../../../_shared/engine-runtime/expedition-rotation-v1.ts";
import { PostgresBootstrapDatabase } from "../../../_shared/command-gateway/bootstrap-database.ts";
import { PostgresGatewayDatabase } from "../../../_shared/command-gateway/database.ts";
import { createCommandGatewayHandler } from "../../../_shared/command-gateway/handler.ts";
import { PostgresRotationDatabase } from "../../../_shared/command-gateway/rotation-database.ts";
import { createRotationExecutor } from "../../../_shared/command-gateway/rotation.ts";
import { StaticRuntimeRegistry } from "../../../_shared/command-gateway/runtime-registry.ts";
import { createSchemaValidator } from "../../../_shared/command-gateway/schema-validation.ts";
import type {
  JsonValue,
  ProcessCommandResult,
} from "../../../_shared/command-gateway/types.ts";

const DB_URL = Deno.env.get("SUPABASE_DB_URL");

Deno.test({
  name:
    "generate_rotation persists deterministic assignments, ready state and exact replay",
  ignore: !DB_URL,
  async fn() {
    const connectionString = DB_URL!;
    const captainAuthUserId = "12000000-0000-0000-0000-00000000009c";
    const participantAuthUserIds = [
      "12000000-0000-0000-0000-00000000009d",
      "12000000-0000-0000-0000-00000000009e",
      "12000000-0000-0000-0000-00000000009f",
    ];
    const expeditionId = "52000000-0000-0000-0000-00000000009c";
    const captainMembershipId = "32000000-0000-0000-0000-00000000009c";
    const runtimeReleaseId = "62000000-0000-0000-0000-00000000009c";
    const participantMembershipIds = [
      "32000000-0000-0000-0000-00000000009d",
      "32000000-0000-0000-0000-00000000009e",
      "32000000-0000-0000-0000-00000000009f",
    ];
    const participantIds = [
      "72000000-0000-0000-0000-00000000009d",
      "72000000-0000-0000-0000-00000000009e",
      "72000000-0000-0000-0000-00000000009f",
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
          id,
          release_key,
          git_commit_sha,
          rules_release,
          content_release,
          reducer_version
        ) values (
          ${runtimeReleaseId}::uuid,
          'rotation_execution_integration',
          '000000000000000000000000000000000000009c',
          'engine_v2_rotation_execution_integration',
          'rotation_execution_integration_v1',
          'rotation_execution_integration_v1'
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
            'captain-rotation-integration@example.test',
            now(),
            now(),
            now()
          ),
          (
            ${participantAuthUserIds[0]}::uuid,
            'authenticated',
            'authenticated',
            'one-rotation-integration@example.test',
            now(),
            now(),
            now()
          ),
          (
            ${participantAuthUserIds[1]}::uuid,
            'authenticated',
            'authenticated',
            'two-rotation-integration@example.test',
            now(),
            now(),
            now()
          ),
          (
            ${participantAuthUserIds[2]}::uuid,
            'authenticated',
            'authenticated',
            'three-rotation-integration@example.test',
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
        if (!profile) throw new Error("rotation_participant_profile_missing");
        return profile.id;
      });
    } finally {
      fixture.release();
      await fixturePool.end();
    }
    assertExists(captainProfileId);
    assertEquals(participantProfileIds.length, 3);

    const bootstrapDatabase = new PostgresBootstrapDatabase(connectionString);
    const gatewayDatabase = new PostgresGatewayDatabase(connectionString);
    const rotationDatabase = new PostgresRotationDatabase(connectionString);
    try {
      const bootstrapCommand = {
        command_id: "cmd_rotation_execution_bootstrap",
        command_type: "create_expedition",
        issued_at: "2026-07-21T21:55:00Z",
        actor_id: captainActorId,
        actor_role: "captain",
        expedition_id: "rotation_execution_integration",
        idempotency_key: "cmd_rotation_execution_bootstrap",
        payload: {
          name: "Rotation Execution Integration",
          timezone: "Europe/Athens",
          duration_days: 12,
          day_boundary_local_time: "06:00",
        },
        day_number: null,
        stage_id: null,
        day_revision: null,
      };
      const bootstrapEvent = {
        event_id: "evt_rotation_execution_bootstrap_01",
        event_type: "expedition.created",
        occurred_at: "2026-07-21T21:55:00Z",
        recorded_at: "2026-07-21T21:55:01Z",
        actor_id: captainActorId,
        actor_role: "captain",
        expedition_id: "rotation_execution_integration",
        day_number: null,
        stage_id: null,
        day_revision: null,
        command_id: bootstrapCommand.command_id,
        idempotency_key: bootstrapCommand.command_id,
        schema_version: 1,
        payload: {
          ...bootstrapCommand.payload,
          recovery_days_available: 1,
        },
      };
      await bootstrapDatabase.bootstrapExpedition({
        expedition: {
          id: expeditionId,
          expedition_key: "rotation_execution_integration",
          name: "Rotation Execution Integration",
          timezone: "Europe/Athens",
          day_boundary_local_time: "06:00",
          duration_days: 12,
          recovery_days_available: 1,
          runtime_release_id: runtimeReleaseId,
          created_by_profile_id: captainProfileId,
        },
        captain_membership: {
          id: captainMembershipId,
          profile_id: captainProfileId,
          role: "captain",
          status: "active",
        },
        process_command_request: {
          expedition_id: expeditionId,
          command: bootstrapCommand,
          actor_context: {
            auth_user_id: captainAuthUserId,
            profile_id: captainProfileId,
            membership_id: captainMembershipId,
            participant_id: null,
            actor_id: captainActorId,
            actor_role: "captain",
          },
          request_hash: "e".repeat(64),
          expected_stream_position: 0,
          status: "accepted",
          events: [bootstrapEvent],
          projection_mutations: [],
          runtime_release_id: runtimeReleaseId,
          reducer_version: "rotation_execution_integration_v1",
          received_at: "2026-07-21T21:55:01Z",
          processed_at: "2026-07-21T21:55:02Z",
          rejection: null,
        },
      } as Record<string, JsonValue>);

      const setupPool = new Pool(connectionString, 1, true);
      const setup = await setupPool.connect();
      try {
        for (let index = 0; index < 3; index += 1) {
          await setup.queryArray`
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
          await setup.queryArray`
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
          expedition_id: "rotation_execution_integration",
          expedition_status: "draft",
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
            status: "not_generated",
            rotation_id: null,
            rules_version: null,
            assignments: [],
          },
          readiness: {
            can_generate_rotation: true,
            can_start_expedition: false,
            blockers: [{
              code: "rotation_not_generated",
              message: "The deterministic Rotation Plan has not been generated.",
              entity_id: null,
            }],
          },
          controls: {
            invite_participant: true,
            revoke_invitation: false,
            generate_rotation: true,
            start_expedition: false,
          },
          expected_projection_version: 1,
          sync_status: "synced",
        };
        await setup.queryArray`
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
            1,
            ${runtimeReleaseId}::uuid,
            'rotation_execution_integration_v1',
            '2026-07-21T21:55:03Z'::timestamptz
          )
        `;
        await setup.queryArray`
          update ilka.projection_heads
          set current_projection_version = 1,
              updated_at = '2026-07-21T21:55:03Z'::timestamptz
          where expedition_id = ${expeditionId}::uuid
        `;
      } finally {
        setup.release();
        await setupPool.end();
      }

      const runtime = createExpeditionRotationRuntime({
        release_key: "rotation_execution_integration",
        git_commit_sha: "000000000000000000000000000000000000009c",
        rules_release: "engine_v2_rotation_execution_integration",
        content_release: "rotation_execution_integration_v1",
        reducer_version: "rotation_execution_integration_v1",
        team_size_min: 3,
        team_size_max: 5,
        rotation_rules_version: 2,
        onboard_role_cycle: [
          "navigation",
          "mooring",
          "order",
          "cook",
          "product_focus",
        ],
        onboarding_product_captain_role: "product_captain",
        onboarding_support_role: "product_support",
      });
      const schemas = createSchemaValidator();
      const rotationExecutor = createRotationExecutor({
        database: rotationDatabase,
        contextDatabase: gatewayDatabase,
        schemas,
        runtimes: new StaticRuntimeRegistry([runtime]),
        now: () => new Date("2026-07-21T22:00:01Z"),
      });
      const handler = createCommandGatewayHandler(
        {
          auth: { verify: async () => ({ id: captainAuthUserId }) },
          database: gatewayDatabase,
          schemas,
          runtimes: new StaticRuntimeRegistry([runtime]),
          allowedOrigins: new Set(["http://localhost:5173"]),
          now: () => new Date("2026-07-21T22:00:01Z"),
          requestId: () => crypto.randomUUID(),
        },
        undefined,
        undefined,
        rotationExecutor,
      );

      const rotationCommand = {
        command_id: "cmd_rotation_execution_generate",
        command_type: "generate_rotation",
        issued_at: "2026-07-21T22:00:00Z",
        actor_id: captainActorId,
        actor_role: "captain",
        expedition_id: "rotation_execution_integration",
        idempotency_key: "cmd_rotation_execution_generate",
        day_number: null,
        stage_id: null,
        day_revision: null,
        payload: {},
      };
      const request = () =>
        new Request("http://localhost/functions/v1/command-gateway", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer integration-session",
            origin: "http://localhost:5173",
          },
          body: JSON.stringify(rotationCommand),
        });

      const firstResponse = await handler(request());
      assertEquals(firstResponse.status, 200);
      const firstBody = await firstResponse.json() as {
        data: ProcessCommandResult;
      };
      assertEquals(firstBody.data.outcome, "accepted");
      assertEquals(firstBody.data.replayed, false);
      assertEquals(firstBody.data.receipt.event_ids.length, 2);

      const replayResponse = await handler(request());
      assertEquals(replayResponse.status, 200);
      const replayBody = await replayResponse.json() as {
        data: ProcessCommandResult;
      };
      assertEquals(replayBody.data.replayed, true);
      assertEquals(replayBody.data.receipt.command_id, rotationCommand.command_id);

      const verificationPool = new Pool(connectionString, 1, true);
      const verification = await verificationPool.connect();
      try {
        const expedition = await verification.queryObject<{ status: string }>`
          select status
          from ilka.expeditions
          where id = ${expeditionId}::uuid
        `;
        assertEquals(expedition.rows[0]?.status, "ready");

        const events = await verification.queryObject<{ event_type: string }>`
          select event_type
          from ilka.event_log
          where expedition_id = ${expeditionId}::uuid
            and command_id = 'cmd_rotation_execution_generate'
          order by stream_position
        `;
        assertEquals(events.rows.map((row) => row.event_type), [
          "rotation.generated",
          "expedition.ready",
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
        assertEquals(setupView.expedition_status, "ready");
        const rotation = setupView.rotation as Record<string, JsonValue>;
        assertEquals(rotation.status, "generated");
        const assignments = rotation.assignments as Array<Record<string, JsonValue>>;
        assertEquals(assignments.length, 3);
        assertEquals(assignments.map((assignment) => assignment.onboard_role_id), [
          "navigation",
          "mooring",
          "order",
        ]);
        assertEquals(
          assignments.filter((assignment) =>
            assignment.product_role_id === "product_captain"
          ).length,
          1,
        );

        const counts = await verification.queryObject<{
          event_count: number;
          receipt_count: number;
        }>`
          select
            (
              select count(*)::integer
              from ilka.event_log
              where expedition_id = ${expeditionId}::uuid
                and command_id = 'cmd_rotation_execution_generate'
            ) as event_count,
            (
              select count(*)::integer
              from ilka.command_receipts
              where expedition_id = ${expeditionId}::uuid
                and command_id = 'cmd_rotation_execution_generate'
            ) as receipt_count
        `;
        assertEquals(counts.rows[0], { event_count: 2, receipt_count: 1 });
      } finally {
        verification.release();
        await verificationPool.end();
      }
    } finally {
      await bootstrapDatabase.close();
      await gatewayDatabase.close();
      await rotationDatabase.close();
    }
  },
});
