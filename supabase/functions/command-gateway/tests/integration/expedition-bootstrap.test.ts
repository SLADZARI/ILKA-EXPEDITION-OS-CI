import { Pool } from "jsr:@db/postgres@0.19.5";
import { assertEquals, assertExists } from "jsr:@std/assert@1.0.19";

import { PostgresBootstrapDatabase } from "../../../_shared/command-gateway/bootstrap-database.ts";
import { PostgresGatewayDatabase } from "../../../_shared/command-gateway/database.ts";
import type { JsonValue } from "../../../_shared/command-gateway/types.ts";

const DB_URL = Deno.env.get("SUPABASE_DB_URL");

Deno.test({
  name: "bootstrap adapter creates one Expedition and returns exact replay",
  ignore: !DB_URL,
  async fn() {
    const connectionString = DB_URL!;
    const fixturePool = new Pool(connectionString, 1, true);
    const fixture = await fixturePool.connect();

    const authUserId = "11000000-0000-0000-0000-000000000084";
    const expeditionId = "51000000-0000-0000-0000-000000000084";
    const membershipId = "31000000-0000-0000-0000-000000000084";
    const runtimeReleaseId = "61000000-0000-0000-0000-000000000084";
    const actorId = `member_${membershipId.replaceAll("-", "")}`;
    const commandId = "cmd_bootstrap_integration_01";
    const eventId = "evt_bootstrap_integration_01_01";
    const requestHash = "d".repeat(64);

    let profileId: string;
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
          'bootstrap_integration_release',
          '0000000000000000000000000000000000000084',
          'engine_v9_bootstrap_integration',
          'bootstrap_content_integration_v1',
          'expedition_bootstrap_integration_v1'
        )
      `;
      await fixture.queryArray`
        insert into auth.users (id, aud, role, email, created_at, updated_at)
        values (
          ${authUserId}::uuid,
          'authenticated',
          'authenticated',
          'bootstrap-integration@example.test',
          now(),
          now()
        )
      `;
      const profile = await fixture.queryObject<{ id: string }>`
        select id from ilka.profiles where auth_user_id = ${authUserId}::uuid
      `;
      profileId = profile.rows[0]?.id;
      assertExists(profileId);
    } finally {
      fixture.release();
      await fixturePool.end();
    }

    const bootstrapDatabase = new PostgresBootstrapDatabase(connectionString);
    const gatewayDatabase = new PostgresGatewayDatabase(connectionString);
    try {
      const profile = await bootstrapDatabase.loadActiveProfile(authUserId);
      assertExists(profile);
      assertEquals(profile.id, profileId);

      const release = await bootstrapDatabase.loadRuntimeRelease(
        "bootstrap_integration_release",
      );
      assertExists(release);
      assertEquals(release.id, runtimeReleaseId);

      const payload = {
        name: "Bootstrap Integration Expedition",
        timezone: "Europe/Athens",
        duration_days: 12,
        day_boundary_local_time: "06:00",
      };
      const command = {
        command_id: commandId,
        command_type: "create_expedition",
        issued_at: "2026-07-21T10:00:00Z",
        actor_id: actorId,
        actor_role: "captain",
        expedition_id: "bootstrap_integration",
        idempotency_key: commandId,
        payload,
        day_number: null,
        stage_id: null,
        day_revision: null,
      };
      const event = {
        event_id: eventId,
        event_type: "expedition.created",
        occurred_at: "2026-07-21T10:00:00Z",
        recorded_at: "2026-07-21T10:00:01Z",
        actor_id: actorId,
        actor_role: "captain",
        expedition_id: "bootstrap_integration",
        day_number: null,
        stage_id: null,
        day_revision: null,
        command_id: commandId,
        idempotency_key: commandId,
        schema_version: 1,
        payload: { ...payload, recovery_days_available: 1 },
      };
      const processRequest = {
        expedition_id: expeditionId,
        command,
        actor_context: {
          auth_user_id: authUserId,
          profile_id: profileId,
          membership_id: membershipId,
          participant_id: null,
          actor_id: actorId,
          actor_role: "captain",
        },
        request_hash: requestHash,
        expected_stream_position: 0,
        status: "accepted",
        events: [event],
        projection_mutations: [],
        runtime_release_id: runtimeReleaseId,
        reducer_version: "expedition_bootstrap_integration_v1",
        received_at: "2026-07-21T10:00:01Z",
        processed_at: "2026-07-21T10:00:02Z",
        rejection: null,
      };
      const request: Record<string, JsonValue> = {
        expedition: {
          id: expeditionId,
          expedition_key: "bootstrap_integration",
          name: "Bootstrap Integration Expedition",
          timezone: "Europe/Athens",
          day_boundary_local_time: "06:00",
          duration_days: 12,
          recovery_days_available: 1,
          runtime_release_id: runtimeReleaseId,
          created_by_profile_id: profileId,
        },
        captain_membership: {
          id: membershipId,
          profile_id: profileId,
          role: "captain",
          status: "active",
        },
        process_command_request: processRequest,
      };

      const created = await bootstrapDatabase.bootstrapExpedition(request);
      assertEquals(created.outcome, "accepted");
      assertEquals(created.replayed, false);
      assertEquals(created.current_stream_position, 1);
      assertEquals(created.receipt.projection_version, 0);
      assertEquals(created.receipt.event_ids, [eventId]);

      const replayed = await bootstrapDatabase.bootstrapExpedition(request);
      assertEquals(replayed.outcome, "accepted");
      assertEquals(replayed.replayed, true);

      const receipt = await gatewayDatabase.getReceipt(commandId);
      assertExists(receipt);
      assertEquals(receipt.expedition_key, "bootstrap_integration");
      assertEquals(receipt.request_hash, requestHash);
    } finally {
      await bootstrapDatabase.close();
      await gatewayDatabase.close();
    }
  },
});
