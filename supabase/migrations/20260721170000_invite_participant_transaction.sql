begin;

create or replace function private.invite_participant(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation jsonb;
  v_process_request jsonb;
  v_command jsonb;
  v_actor jsonb;
  v_events jsonb;
  v_mutations jsonb;
  v_event jsonb;
  v_event_payload jsonb;
  v_mutation jsonb;
  v_projection jsonb;
  v_expedition_id uuid;
  v_process_expedition_id uuid;
  v_invitation_id uuid;
  v_invited_by_membership_id uuid;
  v_actor_auth_user_id uuid;
  v_actor_profile_id uuid;
  v_actor_membership_id uuid;
  v_runtime_release_id uuid;
  v_email_normalized text;
  v_token_hash_hex text;
  v_token_hash bytea;
  v_expires_at timestamptz;
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
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_invite_participant_request';
  end if;

  v_invitation := p_request -> 'invitation';
  v_process_request := p_request -> 'process_command_request';
  if jsonb_typeof(v_invitation) <> 'object'
     or jsonb_typeof(v_process_request) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_invite_participant_request_shape';
  end if;

  v_command := v_process_request -> 'command';
  v_actor := v_process_request -> 'actor_context';
  v_events := coalesce(v_process_request -> 'events', '[]'::jsonb);
  v_mutations := coalesce(v_process_request -> 'projection_mutations', '[]'::jsonb);
  if jsonb_typeof(v_command) <> 'object'
     or jsonb_typeof(v_actor) <> 'object'
     or jsonb_typeof(v_events) <> 'array'
     or jsonb_typeof(v_mutations) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_invite_participant_process_shape';
  end if;

  begin
    v_expedition_id := nullif(v_invitation ->> 'expedition_id', '')::uuid;
    v_process_expedition_id := nullif(v_process_request ->> 'expedition_id', '')::uuid;
    v_invitation_id := nullif(v_invitation ->> 'id', '')::uuid;
    v_invited_by_membership_id := nullif(v_invitation ->> 'invited_by_membership_id', '')::uuid;
    v_actor_auth_user_id := nullif(v_actor ->> 'auth_user_id', '')::uuid;
    v_actor_profile_id := nullif(v_actor ->> 'profile_id', '')::uuid;
    v_actor_membership_id := nullif(v_actor ->> 'membership_id', '')::uuid;
    v_runtime_release_id := nullif(v_process_request ->> 'runtime_release_id', '')::uuid;
    v_expires_at := (v_invitation ->> 'expires_at')::timestamptz;
  exception
    when invalid_text_representation or datetime_field_overflow then
      raise exception using errcode = '22023', message = 'invalid_invite_participant_identifier_or_time';
  end;

  v_email_normalized := lower(btrim(v_invitation ->> 'email_normalized'));
  v_token_hash_hex := v_invitation ->> 'token_hash';
  v_command_id := v_command ->> 'command_id';
  v_request_hash_hex := v_process_request ->> 'request_hash';

  if v_expedition_id is null
     or v_process_expedition_id is distinct from v_expedition_id
     or v_invitation_id is null
     or v_invited_by_membership_id is null
     or v_actor_auth_user_id is null
     or v_actor_profile_id is null
     or v_actor_membership_id is null
     or v_runtime_release_id is null then
    raise exception using errcode = '22023', message = 'invite_participant_required_identifier_missing';
  end if;
  if v_email_normalized is null
     or length(v_email_normalized) < 3
     or length(v_email_normalized) > 254
     or v_email_normalized is distinct from v_invitation ->> 'email_normalized' then
    raise exception using errcode = '22023', message = 'invalid_invitation_email';
  end if;
  if v_token_hash_hex is null or v_token_hash_hex !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invitation_token_invalid';
  end if;
  v_token_hash := decode(v_token_hash_hex, 'hex');
  if v_expires_at is null or v_expires_at <= now() then
    raise exception using errcode = '22023', message = 'invalid_invitation_expiry';
  end if;
  if v_invitation ->> 'role' is distinct from 'participant' then
    raise exception using errcode = '22023', message = 'invalid_invitation_role';
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
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ilka:invitation-email:' || v_expedition_id::text || ':' || v_email_normalized,
      0
    )
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
     or v_invited_by_membership_id is distinct from v_actor_membership_id then
    raise exception using errcode = '42501', message = 'active_captain_membership_required';
  end if;

  v_expected_actor_id := 'member_' || replace(v_actor_membership_id::text, '-', '');
  if v_command ->> 'command_type' is distinct from 'invite_participant'
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
    raise exception using errcode = '23514', message = 'invalid_invite_participant_process_contract';
  end if;

  if jsonb_array_length(v_events) <> 1 or jsonb_array_length(v_mutations) <> 1 then
    raise exception using errcode = '23514', message = 'invalid_invite_participant_mutation_count';
  end if;
  v_event := v_events -> 0;
  v_event_payload := v_event -> 'payload';
  v_expected_invitation_key := 'invitation_' || replace(v_invitation_id::text, '-', '');
  if v_event ->> 'event_type' is distinct from 'invitation.created'
     or v_event_payload ->> 'invitation_id' is distinct from v_expected_invitation_key
     or v_event_payload ->> 'role' is distinct from 'participant'
     or (v_event_payload ->> 'expires_at')::timestamptz is distinct from v_expires_at
     or position('*' in coalesce(v_event_payload ->> 'email_hint', '')) = 0
     or v_event_payload ->> 'email_hint' = v_email_normalized then
    raise exception using errcode = '23514', message = 'invitation_created_event_mismatch';
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
     or v_projection ->> 'sync_status' is distinct from 'synced' then
    raise exception using errcode = '23514', message = 'expedition_setup_projection_mismatch';
  end if;

  if position(v_email_normalized in v_process_request::text) > 0
     or position(v_token_hash_hex in lower(v_process_request::text)) > 0
     or position('"email_normalized"' in v_process_request::text) > 0
     or position('"token_hash"' in v_process_request::text) > 0
     or position('"invitation_token"' in v_process_request::text) > 0 then
    raise exception using errcode = '23514', message = 'invitation_secret_exposure_detected';
  end if;

  if exists (
    select 1
    from ilka.expedition_members as member
    join ilka.profiles as profile on profile.id = member.profile_id
    join auth.users as auth_user on auth_user.id = profile.auth_user_id
    where member.expedition_id = v_expedition_id
      and member.status = 'active'
      and lower(btrim(auth_user.email)) = v_email_normalized
  ) then
    raise exception using errcode = '23505', message = 'participant_already_member';
  end if;
  if exists (
    select 1 from ilka.invitations as invitation
    where invitation.expedition_id = v_expedition_id
      and invitation.email_normalized = v_email_normalized
      and invitation.status = 'pending'
  ) then
    raise exception using errcode = '23505', message = 'pending_invitation_already_exists';
  end if;
  if exists (
    select 1 from ilka.invitations as invitation
    where invitation.token_hash = v_token_hash
  ) then
    raise exception using errcode = '23505', message = 'invitation_token_invalid';
  end if;
  if (
    select count(*)
    from ilka.participants as participant
    where participant.expedition_id = v_expedition_id
      and participant.status = 'active'
  ) + (
    select count(*)
    from ilka.invitations as invitation
    where invitation.expedition_id = v_expedition_id
      and invitation.status = 'pending'
  ) >= 5 then
    raise exception using errcode = '23514', message = 'team_capacity_reached';
  end if;

  insert into ilka.invitations (
    id,
    expedition_id,
    email_normalized,
    role,
    token_hash,
    status,
    invited_by_membership_id,
    expires_at
  ) values (
    v_invitation_id,
    v_expedition_id,
    v_email_normalized,
    'participant',
    v_token_hash,
    'pending',
    v_invited_by_membership_id,
    v_expires_at
  );

  v_result := private.process_command(v_process_request);
  if v_result ->> 'outcome' = 'conflict' then
    raise exception using errcode = '40001', message = 'version_conflict';
  end if;
  if v_result ->> 'outcome' is distinct from 'accepted'
     or coalesce((v_result -> 'receipt' ->> 'stream_position')::bigint, -1) <> v_current_stream_position + 1
     or coalesce((v_result -> 'receipt' ->> 'projection_version')::bigint, -1) <> v_current_projection_version + 1
     or jsonb_array_length(coalesce(v_result -> 'receipt' -> 'event_ids', '[]'::jsonb)) <> 1 then
    raise exception using errcode = '23514', message = 'invite_participant_process_result_invalid';
  end if;

  return v_result;
end;
$$;

comment on function private.invite_participant(jsonb) is
  'Atomically inserts one pending Participant invitation and delegates its receipt, invitation.created event and complete ExpeditionSetupView to private.process_command(jsonb).';

revoke all on function private.invite_participant(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.invite_participant(jsonb) to service_role;

commit;
