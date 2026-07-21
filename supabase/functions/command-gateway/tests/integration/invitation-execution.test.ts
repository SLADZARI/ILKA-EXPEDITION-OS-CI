import { Pool } from "jsr:@db/postgres@0.19.5";
import { assertEquals, assertExists } from "jsr:@std/assert@1.0.19";

import { createExpeditionInvitationRuntime } from "../../../_shared/engine-runtime/expedition-invitations-v1.ts";
import { PostgresBootstrapDatabase } from "../../../_shared/command-gateway/bootstrap-database.ts";
import { commandRequestHash } from "../../../_shared/command-gateway/canonical-json.ts";
import { PostgresGatewayDatabase } from "../../../_shared/command-gateway/database.ts";
import { PostgresInvitationDatabase } from "../../../_shared/command-gateway/invitation-database.ts";
import { createInvitationExecutor } from "../../../_shared/command-gateway/invitation.ts";
import { StaticRuntimeRegistry } from "../../../_shared/command-gateway/runtime-registry.ts";
import { createSchemaValidator } from "../../../_shared/command-gateway/schema-validation.ts";
import type {
  CommandEnvelope,
  JsonValue,
} from "../../../_shared/command-gateway/types.ts";

const DB_URL = Deno.env.get("SUPABASE_DB_URL");

Deno.test({
  name:
    "invitation executor persists invite, pre-membership acceptance and revoke atomically",
  ignore: !DB_URL,
  async fn() {
    const connectionString = DB_URL!;
    const fixturePool = new Pool(connectionString, 1, true);
    const fixture = await fixturePool.connect();

    const captainAuthUserId = "11000000-0000-0000-0000-000000000096";
    const inviteeAuthUserId = "11000000-0000-0000-0000-000000000097";
    const expeditionId = "51000000-0000-0000-0000-000000000096";
    const captainMembershipId = "31000000-0000-0000-0000-000000000096";
    const runtimeReleaseId = "61000000-0000-0000-0000-000000000096";
    const firstInvitationId = "95000000-0000-0000-0000-000000000096";
    const participantMembershipId = "96000000-0000-0000-0000-000000000096";
    const participantId = "97000000-0000-0000-0000-000000000096";
    const secondInvitationId = "95000000-0000-0000-0000-000000000097";
    const captainActorId = `member_${captainMembershipId.replaceAll("-", "")}`;
    const firstToken = "A".repeat(43);
    const secondToken = "B".repeat(43);

    let captainProfileId: string | null = null;
    let inviteeProfileId: string | null = null;
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
          'invitation_execution_integration',
          '0000000000000000000000000000000000000096',
          'engine_v11_invitation_execution_integration',
          'invitation_execution_integration_v1',
          'invitation_execution_integration_v1'
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
            'captain-invitation-integration@example.test',
            now(),
            now(),
            now()
          ),
          (
            ${inviteeAuthUserId}::uuid,
            'authenticated',
            'authenticated',
            'anna-invitation-integration@example.test',
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
          ${inviteeAuthUserId}::uuid
        )
      `;
      captainProfileId = profiles.rows.find((row) =>
        row.auth_user_id === captainAuthUserId
      )?.id ?? null;
      inviteeProfileId = profiles.rows.find((row) =>
        row.auth_user_id === inviteeAuthUserId
      )?.id ?? null;
    } finally {
      fixture.release();
      await fixturePool.end();
    }
    assertExists(captainProfileId);
    assertExists(inviteeProfileId);

    const bootstrapDatabase = new PostgresBootstrapDatabase(connectionString);
    const gatewayDatabase = new PostgresGatewayDatabase(connectionString);
    const invitationDatabase = new PostgresInvitationDatabase(connectionString);
    try {
      const bootstrapCommand = {
        command_id: "cmd_invitation_execution_bootstrap",
        command_type: "create_expedition",
        issued_at: "2026-07-21T21:00:00Z",
        actor_id: captainActorId,
        actor_role: "captain",
        expedition_id: "invitation_execution_integration",
        idempotency_key: "cmd_invitation_execution_bootstrap",
        payload: {
          name: "Invitation Execution Integration",
          timezone: "Europe/Athens",
          duration_days: 12,
          day_boundary_local_time: "06:00",
        },
        day_number: null,
        stage_id: null,
        day_revision: null,
      };
      const bootstrapEvent = {
        event_id: "evt_invitation_execution_bootstrap_01",
        event_type: "expedition.created",
        occurred_at: "2026-07-21T21:00:00Z",
        recorded_at: "2026-07-21T21:00:01Z",
        actor_id: captainActorId,
        actor_role: "captain",
        expedition_id: "invitation_execution_integration",
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
          expedition_key: "invitation_execution_integration",
          name: "Invitation Execution Integration",
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
          request_hash: "d".repeat(64),
          expected_stream_position: 0,
          status: "accepted",
          events: [bootstrapEvent],
          projection_mutations: [],
          runtime_release_id: runtimeReleaseId,
          reducer_version: "invitation_execution_integration_v1",
          received_at: "2026-07-21T21:00:01Z",
          processed_at: "2026-07-21T21:00:02Z",
          rejection: null,
        },
      } as Record<string, JsonValue>);

      const runtime = createExpeditionInvitationRuntime({
        release_key: "invitation_execution_integration",
        git_commit_sha: "0000000000000000000000000000000000000096",
        rules_release: "engine_v11_invitation_execution_integration",
        content_release: "invitation_execution_integration_v1",
        reducer_version: "invitation_execution_integration_v1",
        team_size_min: 3,
        team_size_max: 5,
        invitation_ttl_hours: 168,
      });
      const ids = [
        firstInvitationId,
        participantMembershipId,
        participantId,
        secondInvitationId,
      ];
      let idIndex = 0;
      const executor = createInvitationExecutor({
        database: invitationDatabase,
        contextDatabase: gatewayDatabase,
        schemas: createSchemaValidator(),
        runtimes: new StaticRuntimeRegistry([runtime]),
        now: () => new Date("2026-07-21T21:05:03Z"),
        uuid: () => {
          const value = ids[idIndex++];
          if (!value) throw new Error("integration_uuid_sequence_exhausted");
          return value;
        },
      });

      const inviteCommand: CommandEnvelope = {
        command_id: "cmd_invitation_execution_invite_1",
        command_type: "invite_participant",
        issued_at: "2026-07-21T21:04:59Z",
        actor_id: captainActorId,
        actor_role: "captain",
        expedition_id: "invitation_execution_integration",
        idempotency_key: "cmd_invitation_execution_invite_1",
        payload: {
          email: "anna-invitation-integration@example.test",
          invitation_token: firstToken,
        },
        day_number: null,
        stage_id: null,
        day_revision: null,
      };
      const invited = await executor.execute({
        command: inviteCommand,
        auth_user: { id: captainAuthUserId },
        request_hash: await commandRequestHash(inviteCommand),
      });
      assertEquals(invited.ok, true);

      const acceptCommand: CommandEnvelope = {
        command_id: "cmd_invitation_execution_accept_1",
        command_type: "accept_invitation",
        issued_at: "2026-07-21T21:05:01Z",
        actor_id: inviteeProfileId,
        actor_role: "participant",
        expedition_id: "invitation_execution_integration",
        idempotency_key: "cmd_invitation_execution_accept_1",
        payload: {
          invitation_token: firstToken,
          display_name: "Anna",
        },
        day_number: null,
        stage_id: null,
        day_revision: null,
      };
      const accepted = await executor.execute({
        command: acceptCommand,
        auth_user: {
          id: inviteeAuthUserId,
          email: "anna-invitation-integration@example.test",
          email_verified: true,
        },
        request_hash: await commandRequestHash(acceptCommand),
      });
      assertEquals(accepted.ok, true);

      const secondInviteCommand: CommandEnvelope = {
        ...inviteCommand,
        command_id: "cmd_invitation_execution_invite_2",
        idempotency_key: "cmd_invitation_execution_invite_2",
        payload: {
          email: "second-invitation-integration@example.test",
          invitation_token: secondToken,
        },
      };
      const secondInvited = await executor.execute({
        command: secondInviteCommand,
        auth_user: { id: captainAuthUserId },
        request_hash: await commandRequestHash(secondInviteCommand),
      });
      assertEquals(secondInvited.ok, true);

      const revokeCommand: CommandEnvelope = {
        command_id: "cmd_invitation_execution_revoke_2",
        command_type: "revoke_invitation",
        issued_at: "2026-07-21T21:05:02Z",
        actor_id: captainActorId,
        actor_role: "captain",
        expedition_id: "invitation_execution_integration",
        idempotency_key: "cmd_invitation_execution_revoke_2",
        payload: {
          invitation_id: `invitation_${secondInvitationId.replaceAll("-", "")}`,
          reason: "Participant cannot join.",
        },
        day_number: null,
        stage_id: null,
        day_revision: null,
      };
      const revoked = await executor.execute({
        command: revokeCommand,
        auth_user: { id: captainAuthUserId },
        request_hash: await commandRequestHash(revokeCommand),
      });
      assertEquals(revoked.ok, true);

      const verificationPool = new Pool(connectionString, 1, true);
      const verification = await verificationPool.connect();
      try {
        const participant = await verification.queryObject<{
          participant_key: string;
          participant_order: number;
        }>`
          select participant_key, participant_order
          from ilka.participants
          where id = ${participantId}::uuid
        `;
        assertEquals(participant.rows[0], {
          participant_key: `participant_${participantId.replaceAll("-", "")}`,
          participant_order: 1,
        });

        const events = await verification.queryObject<{ event_type: string }>`
          select event_type
          from ilka.event_log
          where expedition_id = ${expeditionId}::uuid
            and command_id in (
              'cmd_invitation_execution_invite_1',
              'cmd_invitation_execution_accept_1',
              'cmd_invitation_execution_invite_2',
              'cmd_invitation_execution_revoke_2'
            )
          order by stream_position
        `;
        assertEquals(events.rows.map((row) => row.event_type), [
          "invitation.created",
          "invitation.accepted",
          "participant.added",
          "invitation.created",
          "invitation.revoked",
        ]);

        const setup = await verification.queryObject<{
          projection_json: Record<string, JsonValue>;
          projection_version: number;
        }>`
          select projection_json, projection_version
          from ilka.projection_documents
          where expedition_id = ${expeditionId}::uuid
            and projection_key = 'expedition_setup_view'
        `;
        assertEquals(setup.rows[0]?.projection_version, 4);
        const projection = setup.rows[0]?.projection_json;
        assertExists(projection);
        const invitations = projection.invitations as Array<Record<string, JsonValue>>;
        assertEquals(invitations.map((invitation) => invitation.status), [
          "accepted",
          "revoked",
        ]);

        const persisted = await verification.queryObject<{ document: string }>`
          select string_agg(document, ' ' order by document) as document
          from (
            select event_json::text as document
            from ilka.event_log
            where expedition_id = ${expeditionId}::uuid
            union all
            select projection_json::text
            from ilka.projection_documents
            where expedition_id = ${expeditionId}::uuid
          ) as documents
        `;
        const serialized = persisted.rows[0]?.document ?? "";
        assertEquals(serialized.includes(firstToken), false);
        assertEquals(serialized.includes(secondToken), false);
        assertEquals(
          serialized.includes("anna-invitation-integration@example.test"),
          false,
        );
      } finally {
        verification.release();
        await verificationPool.end();
      }
    } finally {
      await bootstrapDatabase.close();
      await gatewayDatabase.close();
      await invitationDatabase.close();
    }
  },
});
