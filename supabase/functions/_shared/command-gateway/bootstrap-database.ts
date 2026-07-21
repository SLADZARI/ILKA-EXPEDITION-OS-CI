import { Pool, type PoolClient } from "jsr:@db/postgres@0.19.5";

import type {
  JsonValue,
  ProcessCommandResult,
  RuntimeRelease,
} from "./types.ts";

export interface ActiveProfile {
  id: string;
  auth_user_id: string;
}

export interface BootstrapDatabase {
  loadActiveProfile(authUserId: string): Promise<ActiveProfile | null>;
  loadRuntimeRelease(releaseKey: string): Promise<RuntimeRelease | null>;
  bootstrapExpedition(
    request: Record<string, JsonValue>,
  ): Promise<ProcessCommandResult>;
}

interface ProfileRow {
  id: string;
  auth_user_id: string;
}

interface RuntimeRow {
  id: string;
  release_key: string;
  git_commit_sha: string;
  rules_release: string;
  content_release: string;
  reducer_version: string;
}

interface BootstrapRow {
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

export class PostgresBootstrapDatabase implements BootstrapDatabase {
  readonly #pool: Pool;

  constructor(connectionString: string, poolSize = 1) {
    if (!connectionString) throw new Error("missing_supabase_db_url");
    this.#pool = new Pool(connectionString, poolSize, true);
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }

  async loadActiveProfile(authUserId: string): Promise<ActiveProfile | null> {
    return await withServiceRole(this.#pool, async (client) => {
      const query = await client.queryObject<ProfileRow>`
        select profile.id, profile.auth_user_id
        from ilka.profiles as profile
        where profile.auth_user_id = ${authUserId}::uuid
          and profile.status = 'active'
      `;
      return query.rows[0] ?? null;
    });
  }

  async loadRuntimeRelease(releaseKey: string): Promise<RuntimeRelease | null> {
    return await withServiceRole(this.#pool, async (client) => {
      const query = await client.queryObject<RuntimeRow>`
        select
          release.id,
          release.release_key,
          release.git_commit_sha,
          release.rules_release,
          release.content_release,
          release.reducer_version
        from ilka.runtime_releases as release
        where release.release_key = ${releaseKey}
      `;
      return query.rows[0] ?? null;
    });
  }

  async bootstrapExpedition(
    request: Record<string, JsonValue>,
  ): Promise<ProcessCommandResult> {
    return await withServiceRole(this.#pool, async (client) => {
      const requestJson = JSON.stringify(request);
      const query = await client.queryObject<BootstrapRow>`
        select private.bootstrap_expedition(${requestJson}::jsonb) as result
      `;
      const row = query.rows[0];
      if (!row) throw new Error("bootstrap_expedition_returned_no_result");
      return row.result;
    });
  }
}
