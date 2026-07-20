import {
  Pool,
  type PoolClient,
} from "jsr:@db/postgres@0.19.5";

import type {
  ExistingReceiptLookup,
  GatewayDatabase,
  GatewayExecutionContext,
  JsonValue,
  ProcessCommandResult,
  ProjectionDocument,
} from "./types.ts";

interface ReceiptRow {
  expedition_key: string;
  request_hash: string;
  result: ProcessCommandResult;
}

interface ContextRow {
  expedition_id: string;
  expedition_key: string;
  expedition_status: string;
  stream_position: number | string;
  projection_version: number | string;
  runtime_release_id: string;
  release_key: string;
  git_commit_sha: string;
  rules_release: string;
  content_release: string;
  reducer_version: string;
  profile_id: string | null;
  membership_id: string | null;
  participant_id: string | null;
  participant_key: string | null;
  membership_role: "captain" | "participant" | "shore_operator" | null;
  projections: ProjectionDocument[] | null;
}

interface ProcessRow {
  result: ProcessCommandResult;
}

async function withServiceRole<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.queryArray("begin");
    await client.queryArray("set local role service_role");
    const result = await operation(client);
    await client.queryArray("commit");
    return result;
  } catch (error) {
    try {
      await client.queryArray("rollback");
    } catch {
      // The original error remains authoritative.
    }
    throw error;
  } finally {
    client.release();
  }
}

export class PostgresGatewayDatabase implements GatewayDatabase {
  readonly #pool: Pool;

  constructor(connectionString: string, poolSize = 1) {
    if (!connectionString) throw new Error("missing_supabase_db_url");
    this.#pool = new Pool(connectionString, poolSize, true);
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }

  async getReceipt(commandId: string): Promise<ExistingReceiptLookup | null> {
    return await withServiceRole(this.#pool, async (client) => {
      const query = await client.queryObject<ReceiptRow>`
        select
          expedition.expedition_key,
          encode(receipt.request_hash, 'hex') as request_hash,
          jsonb_build_object(
            'outcome', receipt.status,
            'replayed', true,
            'persisted', true,
            'receipt', jsonb_build_object(
              'command_id', receipt.command_id,
              'expedition_id', receipt.expedition_id,
              'expedition_key', expedition.expedition_key,
              'command_type', receipt.command_type,
              'actor_auth_user_id', receipt.actor_auth_user_id,
              'actor_profile_id', receipt.actor_profile_id,
              'actor_membership_id', receipt.actor_membership_id,
              'actor_participant_id', receipt.actor_participant_id,
              'actor_role', receipt.actor_role,
              'request_hash', encode(receipt.request_hash, 'hex'),
              'status', receipt.status,
              'received_at', receipt.received_at,
              'processed_at', receipt.processed_at,
              'event_ids', to_jsonb(receipt.event_ids),
              'stream_position', receipt.stream_position,
              'projection_version', receipt.projection_version,
              'runtime_release_id', receipt.runtime_release_id,
              'reducer_version', receipt.reducer_version,
              'rejection_code', receipt.rejection_code,
              'rejection_message', receipt.rejection_message,
              'conflict_code', receipt.conflict_code
            ),
            'projection_updates', '[]'::jsonb,
            'expected_stream_position', case
              when receipt.status = 'accepted'
                then receipt.stream_position - cardinality(receipt.event_ids)
              else receipt.stream_position
            end,
            'current_stream_position', receipt.stream_position
          ) as result
        from ilka.command_receipts as receipt
        join ilka.expeditions as expedition
          on expedition.id = receipt.expedition_id
        where receipt.command_id = ${commandId}
      `;
      return query.rows[0] ?? null;
    });
  }

  async loadContext(
    expeditionKey: string,
    authUserId: string,
  ): Promise<GatewayExecutionContext | null> {
    return await withServiceRole(this.#pool, async (client) => {
      const query = await client.queryObject<ContextRow>`
        select
          expedition.id as expedition_id,
          expedition.expedition_key,
          expedition.status as expedition_status,
          stream_head.current_stream_position as stream_position,
          projection_head.current_projection_version as projection_version,
          release.id as runtime_release_id,
          release.release_key,
          release.git_commit_sha,
          release.rules_release,
          release.content_release,
          release.reducer_version,
          actor.profile_id,
          actor.expedition_member_id as membership_id,
          actor.participant_id,
          participant.participant_key,
          actor.membership_role,
          coalesce(
            jsonb_agg(
              jsonb_build_object(
                'projection_key', document.projection_key,
                'projection_type', document.projection_type,
                'subject_id', document.subject_id,
                'schema_id', document.schema_id,
                'schema_version', document.schema_version,
                'projection', document.projection_json,
                'projection_version', document.projection_version,
                'source_stream_position', document.source_stream_position
              ) order by document.projection_key
            ) filter (where document.projection_key is not null),
            '[]'::jsonb
          ) as projections
        from ilka.expeditions as expedition
        join ilka.runtime_releases as release
          on release.id = expedition.runtime_release_id
        join ilka.stream_heads as stream_head
          on stream_head.expedition_id = expedition.id
        join ilka.projection_heads as projection_head
          on projection_head.expedition_id = expedition.id
        left join lateral private.resolve_actor_context(
          ${authUserId}::uuid,
          expedition.id
        ) as actor on true
        left join ilka.participants as participant
          on participant.id = actor.participant_id
         and participant.expedition_id = expedition.id
        left join ilka.projection_documents as document
          on document.expedition_id = expedition.id
        where expedition.expedition_key = ${expeditionKey}
        group by
          expedition.id,
          release.id,
          stream_head.current_stream_position,
          projection_head.current_projection_version,
          actor.profile_id,
          actor.expedition_member_id,
          actor.participant_id,
          participant.participant_key,
          actor.membership_role
      `;

      const row = query.rows[0];
      if (!row) return null;

      return {
        expedition_id: row.expedition_id,
        expedition_key: row.expedition_key,
        expedition_status: row.expedition_status,
        stream_position: Number(row.stream_position),
        projection_version: Number(row.projection_version),
        runtime_release: {
          id: row.runtime_release_id,
          release_key: row.release_key,
          git_commit_sha: row.git_commit_sha,
          rules_release: row.rules_release,
          content_release: row.content_release,
          reducer_version: row.reducer_version,
        },
        actor: row.profile_id && row.membership_id && row.membership_role
          ? {
            auth_user_id: authUserId,
            profile_id: row.profile_id,
            membership_id: row.membership_id,
            participant_id: row.participant_id,
            participant_key: row.participant_key,
            membership_role: row.membership_role,
          }
          : null,
        projections: row.projections ?? [],
      };
    });
  }

  async processCommand(
    request: Record<string, JsonValue>,
  ): Promise<ProcessCommandResult> {
    return await withServiceRole(this.#pool, async (client) => {
      const requestJson = JSON.stringify(request);
      const query = await client.queryObject<ProcessRow>`
        select private.process_command(${requestJson}::jsonb) as result
      `;
      const row = query.rows[0];
      if (!row) throw new Error("process_command_returned_no_result");
      return row.result;
    });
  }
}
