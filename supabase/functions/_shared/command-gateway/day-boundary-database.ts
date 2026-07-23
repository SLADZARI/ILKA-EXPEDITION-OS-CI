import { Pool, type PoolClient } from "jsr:@db/postgres@0.19.5";

import type { SystemExecutionContext } from "../engine-runtime/day1-boundary-v1.ts";
import type { JsonValue, ProcessCommandResult, ProjectionDocument } from "./types.ts";

export interface DayBoundaryDatabase {
  loadSystemContext(expeditionKey: string): Promise<SystemExecutionContext | null>;
  processDayBoundary(
    request: Record<string, JsonValue>,
  ): Promise<ProcessCommandResult>;
}

interface ContextRow {
  expedition_id: string;
  expedition_key: string;
  expedition_status: string;
  expedition_timezone: string;
  day_boundary_local_time: string;
  duration_days: number | string;
  stream_position: number | string;
  projection_version: number | string;
  runtime_release_id: string;
  release_key: string;
  git_commit_sha: string;
  rules_release: string;
  content_release: string;
  reducer_version: string;
  active_stage_id: string | null;
  expedition_started_at: string | null;
  projections: ProjectionDocument[] | null;
}

interface ResultRow {
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
      // The original failure remains authoritative.
    }
    throw error;
  } finally {
    client.release();
  }
}

export class PostgresDayBoundaryDatabase implements DayBoundaryDatabase {
  readonly #pool: Pool;

  constructor(connectionString: string, poolSize = 1) {
    if (!connectionString) throw new Error("missing_supabase_db_url");
    this.#pool = new Pool(connectionString, poolSize, true);
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }

  async loadSystemContext(
    expeditionKey: string,
  ): Promise<SystemExecutionContext | null> {
    return await withServiceRole(this.#pool, async (client) => {
      const query = await client.queryObject<ContextRow>`
        select
          expedition.id as expedition_id,
          expedition.expedition_key,
          expedition.status as expedition_status,
          expedition.timezone as expedition_timezone,
          to_char(expedition.day_boundary_local_time, 'HH24:MI') as day_boundary_local_time,
          expedition.duration_days,
          stream_head.current_stream_position as stream_position,
          projection_head.current_projection_version as projection_version,
          release.id as runtime_release_id,
          release.release_key,
          release.git_commit_sha,
          release.rules_release,
          release.content_release,
          release.reducer_version,
          (
            select event.event_json -> 'payload' ->> 'stage_id'
            from ilka.event_log as event
            where event.expedition_id = expedition.id
              and event.event_type = 'stage.opened'
            order by event.stream_position desc
            limit 1
          ) as active_stage_id,
          (
            select event.recorded_at::text
            from ilka.event_log as event
            where event.expedition_id = expedition.id
              and event.event_type = 'expedition.started'
            order by event.stream_position desc
            limit 1
          ) as expedition_started_at,
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
        left join ilka.projection_documents as document
          on document.expedition_id = expedition.id
        where expedition.expedition_key = ${expeditionKey}
        group by
          expedition.id,
          release.id,
          stream_head.current_stream_position,
          projection_head.current_projection_version
      `;
      const row = query.rows[0];
      if (!row) return null;
      return {
        expedition_id: row.expedition_id,
        expedition_key: row.expedition_key,
        expedition_status: row.expedition_status,
        expedition_timezone: row.expedition_timezone,
        day_boundary_local_time: row.day_boundary_local_time,
        duration_days: Number(row.duration_days),
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
        actor: null,
        active_stage_id: row.active_stage_id,
        expedition_started_at: row.expedition_started_at,
        projections: row.projections ?? [],
      };
    });
  }

  async processDayBoundary(
    request: Record<string, JsonValue>,
  ): Promise<ProcessCommandResult> {
    return await withServiceRole(this.#pool, async (client) => {
      const requestJson = JSON.stringify(request);
      const query = await client.queryObject<ResultRow>`
        select private.process_day_boundary(${requestJson}::jsonb) as result
      `;
      const row = query.rows[0];
      if (!row) throw new Error("process_day_boundary_returned_no_result");
      return row.result;
    });
  }
}
