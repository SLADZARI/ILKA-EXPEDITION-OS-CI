import { Pool, type PoolClient } from "jsr:@db/postgres@0.19.5";

import type { JsonValue, ProcessCommandResult } from "./types.ts";

export interface StartDatabase {
  startExpedition(
    request: Record<string, JsonValue>,
  ): Promise<ProcessCommandResult>;
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

export class PostgresStartDatabase implements StartDatabase {
  readonly #pool: Pool;

  constructor(connectionString: string, poolSize = 1) {
    if (!connectionString) throw new Error("missing_supabase_db_url");
    this.#pool = new Pool(connectionString, poolSize, true);
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }

  async startExpedition(
    request: Record<string, JsonValue>,
  ): Promise<ProcessCommandResult> {
    return await withServiceRole(this.#pool, async (client) => {
      const requestJson = JSON.stringify(request);
      const query = await client.queryObject<ResultRow>`
        select private.start_expedition(${requestJson}::jsonb) as result
      `;
      const row = query.rows[0];
      if (!row) throw new Error("start_expedition_returned_no_result");
      return row.result;
    });
  }
}
