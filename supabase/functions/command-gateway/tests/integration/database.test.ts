import {
  Pool,
} from "jsr:@db/postgres@0.19.5";
import {
  assertEquals,
  assertExists,
} from "jsr:@std/assert@1.0.19";

import { PostgresGatewayDatabase } from "../../../_shared/command-gateway/database.ts";
import type { JsonValue } from "../../../_shared/command-gateway/types.ts";

const DB_URL = Deno.env.get("SUPABASE_DB_URL");

Deno.test({
  name: "gateway database adapter resolves actor and persists a rejected receipt",
  ignore: !DB_URL,
  async fn() {
    const connectionString = DB_URL!;
    const fixturePool = new Pool(connectionString, 1, true);
    const fixture = await fixturePool.connect();

    const authUserId = "11000000-0000-0000-0000-000000000001";
    const expeditionId = "51000000-0000-0000-0000-000000000001";
    const membershipId = "31000000-0000-0000-0000-000000000001";
    const participantId = "41000000-0000-0000-0000-000000000001";
    const runtimeReleaseId = "61000000-0000-0000-0000-000000000001";

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
          'gateway_integration_release',
          '0000000000000000000000000000000000000014',
          'rules-gateway-integration',
          'content-gateway-integration',
          'reducer-gateway-integration'
        )
      `;
      await fixture.queryArray`
        insert into auth.users (id, aud, role, email, created_at, updated_at)
        values (
          ${authUserId}::uuid,
          'authenticated',
          'authenticated',
          'gateway-integration@example.test',
          now(),
          now()
        )
      `;
      const profile = await fixture.queryObject<{ id: string }>`
        select id
        from ilka.profiles
        where auth_user_id = ${authUserId}::uuid
      `;
      const profileId = profile.rows[0]?.id;
      assertExists(profileId);

      await fixture.queryArray`
        insert into ilka.expeditions (
          id,
          expedition_key,
          name,
          timezone,
          runtime_release_id,
          created_by_profile_id
        ) values (
          ${expeditionId}::uuid,
          'gateway_integration',
          'Gateway Integration Expedition',
          'Europe/Athens',
          ${runtimeReleaseId}::uuid,
          ${profileId}::uuid
        )
      `;
      await fixture.queryArray`
        insert into ilka.expedition_members (
          id,
          expedition_id,
          profile_id,
          role
        ) values (
          ${membershipId}::uuid,
          ${expeditionId}::uuid,
          ${profileId}::uuid,
          'participant'
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
          'participant_gateway_integration',
          ${expeditionId}::uuid,
          ${membershipId}::uuid,
          'Gateway Integration Participant',
          1
        )
      `;
    } finally {
      fixture.release();
      await fixturePool.end();
    }

    const database = new PostgresGatewayDatabase(connectionString);
    try {
      const context = await database.loadContext(
        "gateway_integration",
        authUserId,
      );
      assertExists(context);
      assertEquals(context.stream_position, 0);
      assertEquals(context.projection_version, 0);
      assertEquals(context.actor?.participant_key, "participant_gateway_integration");
      assertEquals(context.actor?.membership_role, "participant");

      const request: Record<string, JsonValue> = {
        expedition_id: expeditionId,
        command: {
          command_id: "cmd_gateway_integration_rejected",
          command_type: "complete_task",
          issued_at: "2026-07-20T21:00:00Z",
          actor_id: "participant_gateway_integration",
          actor_role: "participant",
          expedition_id: "gateway_integration",
          idempotency_key: "cmd_gateway_integration_rejected",
          payload: { task_id: "task_gateway_integration" },
        },
        actor_context: {
          auth_user_id: authUserId,
          profile_id: context.actor!.profile_id,
          membership_id: membershipId,
          participant_id: participantId,
          actor_id: "participant_gateway_integration",
          actor_role: "participant",
        },
        request_hash: "b".repeat(64),
        expected_stream_position: 0,
        status: "rejected",
        events: [],
        projection_mutations: [],
        runtime_release_id: runtimeReleaseId,
        reducer_version: "reducer-gateway-integration",
        received_at: "2026-07-20T21:00:00Z",
        processed_at: "2026-07-20T21:00:01Z",
        rejection: {
          code: "invalid_state",
          message: "Integration rejection.",
        },
      };

      const processed = await database.processCommand(request);
      assertEquals(processed.outcome, "rejected");
      assertEquals(processed.persisted, true);
      assertEquals(processed.current_stream_position, 0);

      const receipt = await database.getReceipt(
        "cmd_gateway_integration_rejected",
      );
      assertExists(receipt);
      assertEquals(receipt.expedition_key, "gateway_integration");
      assertEquals(receipt.request_hash, "b".repeat(64));
      assertEquals(receipt.result.replayed, true);
      assertEquals(receipt.result.receipt.rejection_code, "invalid_state");
    } finally {
      await database.close();
    }
  },
});
