/* GENERATED from supabase/contracts/private-process-command-result.schema.json. Do not edit. */
export type CommandResult = {
  "outcome": "accepted" | "rejected" | "conflict";
  "replayed": boolean;
  "persisted": boolean;
  "receipt": {
    "command_id": string;
    "expedition_id": string;
    "expedition_key": string;
    "command_type": string;
    "actor_auth_user_id": string | null;
    "actor_profile_id": string | null;
    "actor_membership_id": string | null;
    "actor_participant_id": string | null;
    "actor_role": string;
    "request_hash": string;
    "status": "accepted" | "rejected" | "conflict";
    "received_at": string;
    "processed_at": string;
    "event_ids": Array<string>;
    "stream_position": number;
    "projection_version": number;
    "runtime_release_id": string;
    "reducer_version": string;
    "rejection_code": string | null;
    "rejection_message": string | null;
    "conflict_code": string | null;
  };
  "projection_updates": Array<{
    "projection_key": string;
    "projection_version": number;
    "source_stream_position": number;
  }>;
  "expected_stream_position": number;
  "current_stream_position": number;
};
