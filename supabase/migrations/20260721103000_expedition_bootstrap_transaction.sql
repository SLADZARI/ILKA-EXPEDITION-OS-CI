begin;

create or replace function private.bootstrap_expedition(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expedition jsonb;
  v_membership jsonb;
  v_process_request jsonb;
  v_command jsonb;
  v_actor jsonb;
  v_events jsonb;
  v_event jsonb;
  v_payload jsonb;
  v_event_payload jsonb;
  v_expedition_id uuid;
  v_expedition_key text;
  v_expedition_name text;
  v_timezone text;
  v_boundary_text text;
  v_boundary time without time zone;
  v_duration_days smallint;
  v_recovery_days smallint;
  v_runtime_release_id uuid;
  v_profile_id uuid;
  v_membership_id uuid;
  v_membership_profile_id uuid;
  v_actor_auth_user_id uuid;
  v_actor_profile_id uuid;
  v_actor_membership_id uuid;
  v_actor_participant_id uuid;
  v_actor_id text;
  v_expected_actor_id text;
  v_command_id text;
  v_request_hash_hex text;
  v_request_hash bytea;
  v_registered_reducer_version text;
  v_result jsonb;
  v_existing_receipt ilka.command_receipts%rowtype;
  v_existing_expedition_key text;
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_bootstrap_request';
  end if;

  v_expedition := p_request -> 'expedition';
  v_membership := p_request -> 'captain_membership';
  v_process_request := p_request -> 'process_command_request';

  if jsonb_typeof(v_expedition) <> 'object'
     or jsonb_typeof(v_membership) <> 'object'
     or jsonb_typeof(v_process_request) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_bootstrap_request_shape';
  end if;

  v_command := v_process_request -> 'command';
  v_actor := v_process_request -> 'actor_context';
  v_events := coalesce(v_process_request -> 'events', '[]'::jsonb);

  if jsonb_typeof(v_command) <> 'object'
     or jsonb_typeof(v_actor) <> 'object'
     or jsonb_typeof(v_events) <> 'array'
     or jsonb_typeof(coalesce(v_process_request -> 'projection_mutations', '[]'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_bootstrap_process_request_shape';
  end if;

  begin
    v_expedition_id := nullif(v_expedition ->> 'id', '')::uuid;
    v_runtime_release_id := nullif(v_expedition ->> 'runtime_release_id', '')::uuid;
    v_profile_id := nullif(v_expedition ->> 'created_by_profile_id', '')::uuid;
    v_membership_id := nullif(v_membership ->> 'id', '')::uuid;
    v_membership_profile_id := nullif(v_membership ->> 'profile_id', '')::uuid;
    v_actor_auth_user_id := nullif(v_actor ->> 'auth_user_id', '')::uuid;
    v_actor_profile_id := nullif(v_actor ->> 'profile_id', '')::uuid;
    v_actor_membership_id := nullif(v_actor ->> 'membership_id', '')::uuid;
    v_actor_participant_id := nullif(v_actor ->> 'participant_id', '')::uuid;
    v_duration_days := (v_expedition ->> 'duration_days')::smallint;
    v_recovery_days := (v_expedition ->> 'recovery_days_available')::smallint;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = '22023', message = 'invalid_bootstrap_identifier_or_number';
  end;

  v_expedition_key := v_expedition ->> 'expedition_key';
  v_expedition_name := v_expedition ->> 'name';
  v_timezone := v_expedition ->> 'timezone';
  v_boundary_text := v_expedition ->> 'day_boundary_local_time';
  v_command_id := v_command ->> 'command_id';
  v_actor_id := v_actor ->> 'actor_id';
  v_request_hash_hex := v_process_request ->> 'request_hash';

  if v_expedition_id is null
     or v_runtime_release_id is null
     or v_profile_id is null
     or v_membership_id is null
     or v_actor_auth_user_id is null then
    raise exception using errcode = '22023', message = 'bootstrap_required_identifier_missing';
  end if;

  if v_expedition_key is null
     or v_expedition_key !~ '^[a-z0-9][a-z0-9_]{0,127}$' then
    raise exception using errcode = '22023', message = 'invalid_expedition_key';
  end if;

  if v_expedition_name is null
     or length(btrim(v_expedition_name)) = 0
     or length(v_expedition_name) > 200 then
    raise exception using errcode = '22023', message = 'invalid_expedition_name';
  end if;

  if v_timezone is null
     or length(btrim(v_timezone)) = 0
     or length(v_timezone) > 100
     or not exists (
       select 1
       from pg_catalog.pg_timezone_names as timezone_name
       where timezone_name.name = v_timezone
     ) then
    raise exception using errcode = '22023', message = 'invalid_timezone';
  end if;

  if v_boundary_text is null
     or v_boundary_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception using errcode = '22023', message = 'invalid_day_boundary_local_time';
  end if;
  v_boundary := v_boundary_text::time without time zone;

  if v_duration_days is null or v_duration_days < 1 or v_duration_days > 365 then
    raise exception using errcode = '22023', message = 'invalid_duration_days';
  end if;
  if v_recovery_days is null or v_recovery_days < 0 or v_recovery_days > v_duration_days then
    raise exception using errcode = '22023', message = 'invalid_recovery_days_available';
  end if;

  if v_membership ->> 'role' is distinct from 'captain'
     or v_membership ->> 'status' is distinct from 'active' then
    raise exception using errcode = '22023', message = 'invalid_bootstrap_captain_membership';
  end if;

  if v_membership_profile_id is distinct from v_profile_id
     or v_actor_profile_id is distinct from v_profile_id
     or v_actor_membership_id is distinct from v_membership_id
     or v_actor_participant_id is not null then
    raise exception using errcode = '23514', message = 'bootstrap_actor_identity_mismatch';
  end if;

  v_expected_actor_id := 'member_' || replace(v_membership_id::text, '-', '');
  if v_actor_id is distinct from v_expected_actor_id
     or v_actor ->> 'actor_role' is distinct from 'captain'
     or v_command ->> 'actor_id' is distinct from v_expected_actor_id
     or v_command ->> 'actor_role' is distinct from 'captain' then
    raise exception using errcode = '23514', message = 'bootstrap_captain_actor_mismatch';
  end if;

  if v_command_id is null or v_command_id !~ '^cmd_[A-Za-z0-9_-]+$'
     or v_command ->> 'idempotency_key' is distinct from v_command_id then
    raise exception using errcode = '22023', message = 'invalid_bootstrap_command_id';
  end if;

  if v_command ->> 'command_type' is distinct from 'create_expedition'
     or v_command ->> 'expedition_id' is distinct from v_expedition_key
     or (v_command ? 'day_number' and v_command -> 'day_number' <> 'null'::jsonb)
     or (v_command ? 'stage_id' and v_command -> 'stage_id' <> 'null'::jsonb)
     or (v_command ? 'day_revision' and v_command -> 'day_revision' <> 'null'::jsonb) then
    raise exception using errcode = '23514', message = 'invalid_bootstrap_command_context';
  end if;

  if nullif(v_process_request ->> 'expedition_id', '')::uuid is distinct from v_expedition_id
     or nullif(v_process_request ->> 'runtime_release_id', '')::uuid is distinct from v_runtime_release_id
     or (v_process_request ->> 'expected_stream_position')::bigint <> 0
     or v_process_request ->> 'status' is distinct from 'accepted'
     or jsonb_array_length(v_events) <> 1
     or jsonb_array_length(coalesce(v_process_request -> 'projection_mutations', '[]'::jsonb)) <> 0
     or (v_process_request ? 'rejection' and v_process_request -> 'rejection' <> 'null'::jsonb) then
    raise exception using errcode = '23514', message = 'invalid_bootstrap_process_contract';
  end if;

  if v_request_hash_hex is null or v_request_hash_hex !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_request_hash';
  end if;
  v_request_hash := decode(v_request_hash_hex, 'hex');

  v_payload := v_command -> 'payload';
  if jsonb_typeof(v_payload) <> 'object'
     or v_payload ->> 'name' is distinct from v_expedition_name
     or v_payload ->> 'timezone' is distinct from v_timezone
     or (v_payload ->> 'duration_days')::smallint is distinct from v_duration_days
     or v_payload ->> 'day_boundary_local_time' is distinct from v_boundary_text then
    raise exception using errcode = '23514', message = 'bootstrap_command_payload_mismatch';
  end if;

  v_event := v_events -> 0;
  v_event_payload := v_event -> 'payload';
  if jsonb_typeof(v_event) <> 'object'
     or v_event ->> 'event_type' is distinct from 'expedition.created'
     or v_event ->> 'expedition_id' is distinct from v_expedition_key
     or v_event ->> 'command_id' is distinct from v_command_id
     or v_event ->> 'idempotency_key' is distinct from v_command_id
     or v_event ->> 'actor_id' is distinct from v_expected_actor_id
     or v_event ->> 'actor_role' is distinct from 'captain'
     or (v_event ? 'day_number' and v_event -> 'day_number' <> 'null'::jsonb)
     or (v_event ? 'stage_id' and v_event -> 'stage_id' <> 'null'::jsonb)
     or (v_event ? 'day_revision' and v_event -> 'day_revision' <> 'null'::jsonb)
     or jsonb_typeof(v_event_payload) <> 'object'
     or v_event_payload ->> 'name' is distinct from v_expedition_name
     or v_event_payload ->> 'timezone' is distinct from v_timezone
     or (v_event_payload ->> 'duration_days')::smallint is distinct from v_duration_days
     or v_event_payload ->> 'day_boundary_local_time' is distinct from v_boundary_text then
    raise exception using errcode = '23514', message = 'bootstrap_event_mismatch';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ilka:command:' || v_command_id, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ilka:expedition-key:' || v_expedition_key, 0)
  );

  select receipt, expedition.expedition_key
  into v_existing_receipt, v_existing_expedition_key
  from ilka.command_receipts as receipt
  join ilka.expeditions as expedition on expedition.id = receipt.expedition_id
  where receipt.command_id = v_command_id;

  if found then
    if v_existing_receipt.request_hash = v_request_hash
       and v_existing_receipt.actor_auth_user_id = v_actor_auth_user_id
       and v_existing_expedition_key = v_expedition_key then
      return private.build_persisted_command_result(
        v_command_id,
        true,
        0,
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

  if exists (
    select 1 from ilka.expeditions as expedition
    where expedition.expedition_key = v_expedition_key
  ) then
    raise exception using errcode = '23505', message = 'expedition_key_already_exists';
  end if;

  if not exists (
    select 1
    from ilka.profiles as profile
    where profile.id = v_profile_id
      and profile.auth_user_id = v_actor_auth_user_id
      and profile.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'active_profile_required';
  end if;

  select release.reducer_version
  into v_registered_reducer_version
  from ilka.runtime_releases as release
  where release.id = v_runtime_release_id;

  if not found then
    raise exception using errcode = '23503', message = 'runtime_release_unavailable';
  end if;

  if v_process_request ->> 'reducer_version' is distinct from v_registered_reducer_version then
    raise exception using errcode = '23514', message = 'reducer_version_mismatch';
  end if;

  insert into ilka.expeditions (
    id,
    expedition_key,
    name,
    status,
    timezone,
    day_boundary_local_time,
    duration_days,
    recovery_days_available,
    runtime_release_id,
    created_by_profile_id
  ) values (
    v_expedition_id,
    v_expedition_key,
    btrim(v_expedition_name),
    'draft',
    v_timezone,
    v_boundary,
    v_duration_days,
    v_recovery_days,
    v_runtime_release_id,
    v_profile_id
  );

  insert into ilka.expedition_members (
    id,
    expedition_id,
    profile_id,
    role,
    status
  ) values (
    v_membership_id,
    v_expedition_id,
    v_profile_id,
    'captain',
    'active'
  );

  v_result := private.process_command(v_process_request);

  if v_result ->> 'outcome' is distinct from 'accepted'
     or coalesce((v_result -> 'receipt' ->> 'stream_position')::bigint, -1) <> 1
     or coalesce((v_result -> 'receipt' ->> 'projection_version')::bigint, -1) <> 0
     or jsonb_array_length(coalesce(v_result -> 'receipt' -> 'event_ids', '[]'::jsonb)) <> 1 then
    raise exception using errcode = '23514', message = 'bootstrap_process_result_invalid';
  end if;

  return v_result;
end;
$$;

comment on function private.bootstrap_expedition(jsonb) is
  'Atomically creates a draft Expedition and Captain membership, initializes heads through existing triggers, and persists one prepared expedition.created command through private.process_command(jsonb).';

revoke all on function private.bootstrap_expedition(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.bootstrap_expedition(jsonb) to service_role;

commit;
