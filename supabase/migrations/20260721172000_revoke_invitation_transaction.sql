begin;

create or replace function private.revoke_invitation(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transition jsonb;
  v_process_request jsonb;
  v_command jsonb;
  v_actor jsonb;
  v_events jsonb;
  v_mutations jsonb;
  v_event jsonb;
  v_mutation jsonb;
  v_projection jsonb;
  v_expedition_id uuid;
  v_process_expedition_id uuid;
  v_invitation_id uuid;
  v_revoked_by_profile_id uuid;
  v_actor_auth_user_id uuid;
  v_actor_profile_id uuid;
  v_actor_membership_id uuid;
  v_runtime_release_id uuid;
  v_reason text;
  v_command_id text;
  v_request_hash_hex text;
  v_request_hash bytea;
  v_expedition_key text;
  v_expedition_status text;
  v_pinned_runtime_release_id uuid;
  v_registered_reducer_version text;
  v_current_stream_position bigint;
  v_current_projection_version bigint;
  v_expected_actor_id text;
  v_expected_invitation_key text;
  v_result jsonb;
  v_existing_receipt record;
  v_resolved_actor record;
  v_locked_invitation ilka.invitations%rowtype;
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_revoke_invitation_request';
  end if;

  v_transition := p_request -> 'invitation_transition';
  v_process_request := p_request -> 'process_command_request';
  if jsonb_typeof(v_transition) <> 'object'
     or jsonb_typeof(v_process_request) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_revoke_invitation_request_shape';
  end if;

  v_command := v_process_request -> 'command';
  v_actor := v_process_request -> 'actor_context';
  v_events := coalesce(v_process_request -> 'events', '[]'::jsonb);
  v_mutations := coalesce(v_process_request -> 'projection_mutations', '[]'::jsonb);
  if jsonb_typeof(v_command) <> 'object'
     or jsonb_typeof(v_actor) <> 'object'
     or jsonb_typeof(v_events) <> 'array'
     or jsonb_typeof(v_mutations) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_revoke_invitation_process_shape';
  end if;

  begin
    v_expedition_id := nullif(v_transition ->> 'expedition_id', '')::uuid;
    v_process_expedition_id := nullif(v_process_request ->> 'expedition_id', '')::uuid;
    v_invitation_id := nullif(v_transition ->> 'invitation_id', '')::uuid;
    v_revoked_by_profile_id := nullif(v_transition ->> 'revoked_by_profile_id', '')::uuid;
    v_actor_auth_user_id := nullif(v_actor ->> 'auth_user_id', '')::uuid;
    v_actor_profile_id := nullif(v_actor ->> 'profile_id', '')::uuid;
    v_actor_membership_id := nullif(v_actor ->> 'membership_id', '')::uuid;
    v_runtime_release_id := nullif(v_process_request ->> 'runtime_release_id', '')::uuid;
  exception
    when invalid_text_representation then
      raise exception using errcode = '22023', message = 'invalid_revoke_invitation_identifier';
  end;

  v_reason := btrim(v_transition ->> 'reason');
  v_command_id := v_command ->> 'command_id';
  v_request_hash_hex := v_process_request ->> 'request_hash';
  if v_expedition_id is null
     or v_process_expedition_id is distinct from v_expedition_id
     or v_invitation_id is null
     or v_revoked_by_profile_id is null
     or v_actor_auth_user_id is null
     or v_actor_profile_id is null
     or v_actor_membership_id is null
     or v_runtime_release_id is null then
    raise exception using errcode = '22023', message = 'revoke_invitation_required_identifier_missing';
  end if;
  if v_transition ->> 'expected_status' is distinct from 'pending'
     or v_reason is null
     or length(v_reason) = 0
     or length(v_reason) > 2000 then
    raise exception using errcode = '22023', message = 'invalid_invitation_revocation';
  end if;
  if v_command_id is null or v_command_id !~ '^cmd_[A-Za-z0-9_-]+$'
     or v_command ->> 'idempotency_key' is distinct from v_command_id then
    raise exception using errcode = '22023', message = 'invalid_invitation_command_id';
  end if;
  if v_request_hash_hex is null or v_request_hash_hex !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_request_hash';
  end if;
  v_request_hash := decode(v_request_hash_hex, 'hex');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ilka:command:' || v_command_id, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ilka:expedition:' || v_expedition_id::text, 0)
  );

  select
    receipt.expedition_id,
    receipt.request_hash,
    receipt.actor_auth_user_id,
    receipt.stream_position,
    cardinality(receipt.event_ids) as event_count
  into v_existing_receipt
  from ilka.command_receipts as receipt
  where receipt.command_id = v_command_id;

  if found then
    if v_existing_receipt.expedition_id = v_expedition_id
       and v_existing_receipt.request_hash = v_request_hash
       and v_existing_receipt.actor_auth_user_id = v_actor_auth_user_id then
      return private.build_persisted_command_result(
        v_command_id,
        true,
        v_existing_receipt.stream_position - v_existing_receipt.event_count,
        '[]'::jsonb
      );
    end if;
    if v_existing_receipt.actor_auth_user_id is distinct from v_actor_auth_user_id then
      raise exception using errcode = '42501', message = 'receipt_actor_mismatch';
    end if;
    raise exception using
      errcode = '23514',
      message = 'idempotency_key_reused_with_different_payload';
  end if;

  select
    expedition.expedition_key,
    expedition.status,
    expedition.runtime_release_id,
    release.reducer_version,
    stream_head.current_stream_position,
    projection_head.current_projection_version
  into
    v_expedition_key,
    v_expedition_status,
    v_pinned_runtime_release_id,
    v_registered_reducer_version,
    v_current_stream_position,
    v_current_projection_version
  from ilka.expeditions as expedition
  join ilka.runtime_releases as release on release.id = expedition.runtime_release_id
  join ilka.stream_heads as stream_head on stream_head.expedition_id = expedition.id
  join ilka.projection_heads as projection_head on projection_head.expedition_id = expedition.id
  where expedition.id = v_expedition_id;

  if not found then
    raise exception using errcode = '23503', message = 'expedition_not_found';
  end if;
  if v_expedition_status <> 'draft' then
    raise exception using errcode = '23514', message = 'expedition_not_in_setup';
  end if;
  if v_runtime_release_id is distinct from v_pinned_runtime_release_id
     or v_process_request ->> 'reducer_version' is distinct from v_registered_reducer_version then
    raise exception using errcode = '23514', message = 'runtime_release_mismatch';
  end if;

  select resolved.*
  into v_resolved_actor
  from private.resolve_actor_context(v_actor_auth_user_id, v_expedition_id) as resolved;
  if not found
     or v_resolved_actor.profile_id is distinct from v_actor_profile_id
     or v_resolved_actor.expedition_member_id is distinct from v_actor_membership_id
     or v_resolved_actor.membership_role is distinct from 'captain'
     or v_resolved_actor.participant_id is not null
     or v_revoked_by_profile_id is distinct from v_actor_profile_id then
    raise exception using errcode = '42501', message = 'active_captain_membership_required';
  end if;

  v_expected_actor_id := 'member_' || replace(v_actor_membership_id::text, '-', '');
  if v_command ->> 'command_type' is distinct from 'revoke_invitation'
     or v_command ->> 'expedition_id' is distinct from v_expedition_key
     or v_command ->> 'actor_id' is distinct from v_expected_actor_id
     or v_command ->> 'actor_role' is distinct from 'captain'
     or v_actor ->> 'actor_id' is distinct from v_expected_actor_id
     or v_actor ->> 'actor_role' is distinct from 'captain'
     or nullif(v_actor ->> 'participant_id', '') is not null
     or v_command -> 'payload' is distinct from '{}'::jsonb
     or (v_command ? 'day_number' and v_command -> 'day_number' <> 'null'::jsonb)
     or (v_command ? 'stage_id' and v_command -> 'stage_id' <> 'null'::jsonb)
     or (v_command ? 'day_revision' and v_command -> 'day_revision' <> 'null'::jsonb)
     or v_process_request ->> 'status' is distinct from 'accepted'
     or (v_process_request ? 'rejection' and v_process_request -> 'rejection' <> 'null'::jsonb) then
    raise exception using errcode = '23514', message = 'invalid_revoke_invitation_process_contract';
  end if;

  select invitation.*
  into v_locked_invitation
  from ilka.invitations as invitation
  where invitation.id = v_invitation_id
    and invitation.expedition_id = v_expedition_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'invitation_not_found';
  end if;
  if v_locked_invitation.status <> 'pending' then
    raise exception using errcode = '23514', message = 'invitation_not_pending';
  end if;
  if v_locked_invitation.expires_at <= now() then
    raise exception using errcode = '22023', message = 'invitation_expired';
  end if;

  if jsonb_array_length(v_events) <> 1 or jsonb_array_length(v_mutations) <> 1 then
    raise exception using errcode = '23514', message = 'invalid_revoke_invitation_mutation_count';
  end if;
  v_expected_invitation_key := 'invitation_' || replace(v_invitation_id::text, '-', '');
  v_event := v_events -> 0;
  if v_event ->> 'event_type' is distinct from 'invitation.revoked'
     or v_event -> 'payload' ->> 'invitation_id' is distinct from v_expected_invitation_key
     or v_event -> 'payload' ->> 'reason' is distinct from v_reason then
    raise exception using errcode = '23514', message = 'invitation_revoked_event_mismatch';
  end if;

  v_mutation := v_mutations -> 0;
  v_projection := v_mutation -> 'projection';
  if v_mutation ->> 'operation' is distinct from 'upsert'
     or v_mutation ->> 'projection_key' is distinct from 'expedition_setup_view'
     or v_mutation ->> 'projection_type' is distinct from 'expedition_setup_view'
     or (v_mutation ? 'subject_id' and v_mutation -> 'subject_id' <> 'null'::jsonb)
     or v_mutation ->> 'schema_id' is distinct from 'https://ilka.local/schemas/expedition-setup-view.schema.json'
     or v_mutation ->> 'schema_version' is distinct from '1'
     or jsonb_typeof(v_projection) <> 'object'
     or v_projection ->> 'expedition_id' is distinct from v_expedition_key
     or (v_projection ->> 'expected_projection_version')::bigint is distinct from v_current_projection_version + 1
     or v_projection ->> 'sync_status' is distinct from 'synced'
     or position(v_expected_invitation_key in v_projection::text) = 0 then
    raise exception using errcode = '23514', message = 'expedition_setup_projection_mismatch';
  end if;

  if position('"email_normalized"' in v_process_request::text) > 0
     or position('"token_hash"' in v_process_request::text) > 0
     or position('"invitation_token"' in v_process_request::text) > 0 then
    raise exception using errcode = '23514', message = 'invitation_secret_exposure_detected';
  end if;

  update ilka.invitations
  set status = 'revoked',
      revoked_at = now(),
      revoked_by_profile_id = v_revoked_by_profile_id,
      revocation_reason = v_reason
  where id = v_invitation_id
    and status = 'pending';
  if not found then
    raise exception using errcode = '23514', message = 'invitation_not_pending';
  end if;

  v_result := private.process_command(v_process_request);
  if v_result ->> 'outcome' = 'conflict' then
    raise exception using errcode = '40001', message = 'version_conflict';
  end if;
  if v_result ->> 'outcome' is distinct from 'accepted'
     or coalesce((v_result -> 'receipt' ->> 'stream_position')::bigint, -1) <> v_current_stream_position + 1
     or coalesce((v_result -> 'receipt' ->> 'projection_version')::bigint, -1) <> v_current_projection_version + 1
     or jsonb_array_length(coalesce(v_result -> 'receipt' -> 'event_ids', '[]'::jsonb)) <> 1 then
    raise exception using errcode = '23514', message = 'revoke_invitation_process_result_invalid';
  end if;

  return v_result;
end;
$$;

comment on function private.revoke_invitation(jsonb) is
  'Atomically marks one pending invitation revoked and delegates its receipt, invitation.revoked event and complete ExpeditionSetupView to private.process_command(jsonb).';

revoke all on function private.revoke_invitation(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.revoke_invitation(jsonb) to service_role;

commit;
