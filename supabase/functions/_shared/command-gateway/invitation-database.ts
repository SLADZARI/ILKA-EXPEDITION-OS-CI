import { Pool, type PoolClient } from "jsr:@db/postgres@0.19.5";

import type { JsonValue, ProcessCommandResult } from "./types.ts";

export interface InvitationActiveProfile {
  id: string;
  auth_user_id: string;
  status: "active";
}

export interface InvitationAcceptanceCandidate {
  invitation_id: string;
  email_normalized: string;
  role: string;
  status: string;
  expires_at: string;
  participant_order: number | null;
}

export interface InvitationDatabase {
  loadActiveProfile(authUserId: string): Promise<InvitationActiveProfile | null>;
  loadAcceptanceCandidate(
    expeditionId: string,
    tokenHash: string,
  ): Promise<InvitationAcceptanceCandidate | null>;
  inviteParticipant(
    request: Record<string, JsonValue>,
  ): Promise<ProcessCommandResult>;
  acceptInvitation(
    request: Record<string, JsonValue>,
  ): Promise<ProcessCommandResult>;
  revokeInvitation(
    request: Record<string, JsonValue>,
  ): Promise<ProcessCommandResult>;
}

interface ProfileRow {
  id: string;
  auth_user_id: string;
  status: "active";
}

interface CandidateRow {
  invitation_id: string;
  email_normalized: string;
  role: string;
  status: string;
  expires_at: string;
  participant_order: number | string | null;
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
      // The original error remains authoritative.
    }
    throw error;
  } finally {
    client.release();
  }
}

export class PostgresInvitationDatabase implements InvitationDatabase {
  readonly #pool: Pool;

  constructor(connectionString: string, poolSize = 1) {
    if (!connectionString) throw new Error("missing_supabase_db_url");
    this.#pool = new Pool(connectionString, poolSize, true);
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }

  async loadActiveProfile(
    authUserId: string,
  ): Promise<InvitationActiveProfile | null> {
    return await withServiceRole(this.#pool, async (client) => {
      const query = await client.queryObject<ProfileRow>`
        select profile.id, profile.auth_user_id, profile.status
        from ilka.profiles as profile
        where profile.auth_user_id = ${authUserId}::uuid
          and profile.status = 'active'
      `;
      return query.rows[0] ?? null;
    });
  }

  async loadAcceptanceCandidate(
    expeditionId: string,
    tokenHash: string,
  ): Promise<InvitationAcceptanceCandidate | null> {
    return await withServiceRole(this.#pool, async (client) => {
      const query = await client.queryObject<CandidateRow>`
        select
          invitation.id as invitation_id,
          invitation.email_normalized,
          invitation.role,
          invitation.status,
          invitation.expires_at,
          available_order.participant_order
        from ilka.invitations as invitation
        left join lateral (
          select candidate.order_value::smallint as participant_order
          from generate_series(1, 5) as candidate(order_value)
          where not exists (
            select 1
            from ilka.participants as participant
            where participant.expedition_id = invitation.expedition_id
              and participant.participant_order = candidate.order_value
          )
          order by candidate.order_value
          limit 1
        ) as available_order on true
        where invitation.expedition_id = ${expeditionId}::uuid
          and invitation.token_hash = decode(${tokenHash}, 'hex')
      `;
      const row = query.rows[0];
      if (!row) return null;
      return {
        invitation_id: row.invitation_id,
        email_normalized: row.email_normalized,
        role: row.role,
        status: row.status,
        expires_at: row.expires_at,
        participant_order: row.participant_order === null
          ? null
          : Number(row.participant_order),
      };
    });
  }

  async inviteParticipant(
    request: Record<string, JsonValue>,
  ): Promise<ProcessCommandResult> {
    return await this.#call("invite_participant", request);
  }

  async acceptInvitation(
    request: Record<string, JsonValue>,
  ): Promise<ProcessCommandResult> {
    return await this.#call("accept_invitation", request);
  }

  async revokeInvitation(
    request: Record<string, JsonValue>,
  ): Promise<ProcessCommandResult> {
    return await this.#call("revoke_invitation", request);
  }

  async #call(
    functionName: "invite_participant" | "accept_invitation" | "revoke_invitation",
    request: Record<string, JsonValue>,
  ): Promise<ProcessCommandResult> {
    return await withServiceRole(this.#pool, async (client) => {
      const requestJson = JSON.stringify(request);
      let query;
      if (functionName === "invite_participant") {
        query = await client.queryObject<ResultRow>`
          select private.invite_participant(${requestJson}::jsonb) as result
        `;
      } else if (functionName === "accept_invitation") {
        query = await client.queryObject<ResultRow>`
          select private.accept_invitation(${requestJson}::jsonb) as result
        `;
      } else {
        query = await client.queryObject<ResultRow>`
          select private.revoke_invitation(${requestJson}::jsonb) as result
        `;
      }
      const row = query.rows[0];
      if (!row) throw new Error(`${functionName}_returned_no_result`);
      return row.result;
    });
  }
}
