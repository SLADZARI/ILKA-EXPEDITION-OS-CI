begin;

create or replace function private.process_day_boundary(p_request jsonb)
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
  v_expedition_id uuid;
  v_process_expedition_id uuid;
  v_runtime_release_id uuid;
  v_command_id text;
  v_request_hash_hex text;
  v_request_hash bytea;
  v_local_calendar_date date;
  v_boundary_at timestamptz;
  v_received_at timestamptz;
  v_rotation_id text;
  v_rules_version integer;
  v_participant_keys jsonb;
  v_expedition_key text;
  v_expedition_status text;
  v_timezone text;
  v_day_boundary_local_time time without time zone;
  v_pinned_runtime_release_id uuid;
  v_registered_reducer_version text;
  v_current_stream_position bigint;
  v_current_projection_version bigint;
  v_active_stage_id text;
  v_current_setup jsonb;
  v_active_participant_count integer;
  v_database_participant_keys jsonb;
  v_assignment_count integer;
  v_bundle_count integer;
  v_today_count integer;
  v_captain_count integer;
  v_result jsonb;
  v_existing_receipt record;
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_process_day_boundary_request';
  end if;

  v_transition := p_request -> 'boundary_transition';
  v_process_request := p_request -> 'process_command_request';
  if jsonb_typeof(v_transition) <> 'object'
     or jsonb_typeof(v_process_request) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_process_day_boundary_request_shape';
  end if;

  v_command := v_process_request -> 'command';
  v_actor := v_process_request -> 'actor_context';
  v_events := coalesce(v_process_request -> 'events', '[]'::jsonb);
  v_mutations := coalesce(v_process_request -> 'projection_mutations', '[]'::jsonb);
  if jsonb_typeof(v_command) <> 'object'
     or jsonb_typeof(v_actor) <> 'object'
     or jsonb_typeof(v_events) <> 'array'
     or jsonb_typeof(v_mutations) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_process_day_boundary_process_shape';
  end if;

  begin
    v_expedition_id := nullif(v_transition ->> 'expedition_id', '')::uuid;
    v_process_expedition_id := nullif(v_process_request ->> 'expedition_id', '')::uuid;
    v_runtime_release_id := nullif(v_process_request ->> 'runtime_release_id', '')::uuid;
    v_local_calendar_date := nullif(v_transition ->> 'local_calendar_date', '')::date;
    v_boundary_at := nullif(v_transition ->> 'boundary_at', '')::timestamptz;
    v_received_at := nullif(v_process_request ->> 'received_at', '')::timestamptz;
    v_rules_version := nullif(v_transition ->> 'rules_version', '')::integer;
  exception
    when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
      raise exception using errcode = '22023', message = 'invalid_process_day_boundary_identifier';
  end;

  v_command_id := v_command ->> 'command_id';
  v_request_hash_hex := v_process_request ->> 'request_hash';
  v_rotation_id := v_transition ->> 'rotation_id';
  v_participant_keys := v_transition -> 'participant_keys';

  if v_expedition_id is null
     or v_process_expedition_id is distinct from v_expedition_id
     or v_runtime_release_id is null
     or v_local_calendar_date is null
     or v_boundary_at is null
     or v_received_at is null
     or v_rules_version is null
     or jsonb_typeof(v_participant_keys) <> 'array' then
    raise exception using errcode = '22023', message = 'process_day_boundary_required_identifier_missing';
  end if;
  if coalesce((v_transition ->> 'day_number')::integer, 0) <> 1
     or coalesce((v_transition ->> 'day_revision')::integer, 0) <> 1
     or v_transition ->> 'stage_id' is distinct from 'onboarding'
     or v_rotation_id is null
     or v_rotation_id !~ '^rotation_[0-9a-f]{32}$'
     or v_rules_version < 1 then
    raise exception using errcode = '22023', message = 'invalid_process_day_boundary_transition';
  end if;
  if v_command_id is null
     or v_command_id !~ '^cmd_day_boundary_[A-Za-z0-9_]+_[0-9]{8}$'
     or v_command ->> 'idempotency_key' is distinct from v_command_id then
    raise exception using errcode = '22023', message = 'invalid_process_day_boundary_command_id';
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
    receipt.actor_profile_id,
    receipt.actor_membership_id,
    receipt.actor_participant_id,
    receipt.actor_role,
    receipt.stream_position,
    cardinality(receipt.event_ids) as event_count
  into v_existing_receipt
  from ilka.command_receipts as receipt
  where receipt.command_id = v_command_id;

  if found then
    if v_existing_receipt.expedition_id = v_expedition_id
       and v_existing_receipt.request_hash = v_request_hash
       and v_existing_receipt.actor_auth_user_id is null
       and v_existing_receipt.actor_profile_id is null
       and v_existing_receipt.actor_membership_id is null
       and v_existing_receipt.actor_participant_id is null
       and v_existing_receipt.actor_role = 'system_clock' then
      return private.build_persisted_command_result(
        v_command_id,
        true,
        v_existing_receipt.stream_position - v_existing_receipt.event_count,
        '[]'::jsonb
      );
    end if;
    if v_existing_receipt.actor_role is distinct from 'system_clock'
       or v_existing_receipt.actor_auth_user_id is not null
       or v_existing_receipt.actor_profile_id is not null
       or v_existing_receipt.actor_membership_id is not null
       or v_existing_receipt.actor_participant_id is not null then
      raise exception using errcode = '42501', message = 'receipt_actor_mismatch';
    end if;
    raise exception using
      errcode = '23514',
      message = 'idempotency_key_reused_with_different_payload';
  end if;

  select
    expedition.expedition_key,
    expedition.status,
    expedition.timezone,
    expedition.day_boundary_local_time,
    expedition.runtime_release_id,
    release.reducer_version,
    stream_head.current_stream_position,
    projection_head.current_projection_version
  into
    v_expedition_key,
    v_expedition_status,
    v_timezone,
    v_day_boundary_local_time,
    v_pinned_runtime_release_id,
    v_registered_reducer_version,
    v_current_stream_position,
    v_current_projection_version
  from ilka.expeditions as expedition
  join ilka.runtime_releases as release on release.id = expedition.runtime_release_id
  join ilka.stream_heads as stream_head on stream_head.expedition_id = expedition.id
  join ilka.projection_heads as projection_head on projection_head.expedition_id = expedition.id
  where expedition.id = v_expedition_id
  for update of expedition, projection_head;

  if not found then
    raise exception using errcode = '23503', message = 'expedition_not_found';
  end if;
  if v_expedition_status <> 'active' then
    raise exception using errcode = '23514', message = 'expedition_not_active';
  end if;
  if v_runtime_release_id is distinct from v_pinned_runtime_release_id
     or v_process_request ->> 'reducer_version' is distinct from v_registered_reducer_version then
    raise exception using errcode = '23514', message = 'runtime_release_mismatch';
  end if;

  if v_command ->> 'command_type' is distinct from 'process_day_boundary'
     or v_command ->> 'expedition_id' is distinct from v_expedition_key
     or v_command ->> 'actor_id' is distinct from 'system_clock'
     or v_command ->> 'actor_role' is distinct from 'system_clock'
     or v_actor ->> 'actor_id' is distinct from 'system_clock'
     or v_actor ->> 'actor_role' is distinct from 'system_clock'
     or nullif(v_actor ->> 'auth_user_id', '') is not null
     or nullif(v_actor ->> 'profile_id', '') is not null
     or nullif(v_actor ->> 'membership_id', '') is not null
     or nullif(v_actor ->> 'participant_id', '') is not null
     or v_process_request ->> 'status' is distinct from 'accepted'
     or (v_process_request ? 'rejection' and v_process_request -> 'rejection' <> 'null'::jsonb)
     or (v_command ? 'day_number' and v_command -> 'day_number' <> 'null'::jsonb)
     or (v_command ? 'stage_id' and v_command -> 'stage_id' <> 'null'::jsonb)
     or (v_command ? 'day_revision' and v_command -> 'day_revision' <> 'null'::jsonb)
     or (v_command ? 'device_id' and v_command -> 'device_id' <> 'null'::jsonb) then
    raise exception using errcode = '23514', message = 'system_actor_not_allowed';
  end if;

  if v_command_id is distinct from (
    'cmd_day_boundary_' || v_expedition_key || '_' || to_char(v_local_calendar_date, 'YYYYMMDD')
  ) then
    raise exception using errcode = '23514', message = 'invalid_process_day_boundary_command_id';
  end if;
  if v_command -> 'payload' ->> 'local_calendar_date' is distinct from v_local_calendar_date::text
     or (v_command -> 'payload' ->> 'boundary_at')::timestamptz is distinct from v_boundary_at
     or (
  select count(*)
  from jsonb_object_keys(v_command -> 'payload')
) <> 2 then
    raise exception using errcode = '23514', message = 'boundary_date_mismatch';
  end if;
  if (v_boundary_at at time zone v_timezone)::date is distinct from v_local_calendar_date
     or (v_boundary_at at time zone v_timezone)::time is distinct from v_day_boundary_local_time
     or (v_received_at at time zone v_timezone)::date is distinct from v_local_calendar_date then
    raise exception using errcode = '23514', message = 'boundary_date_mismatch';
  end if;
  if v_received_at < v_boundary_at then
    raise exception using errcode = '23514', message = 'local_boundary_not_reached';
  end if;

  select event.event_json -> 'payload' ->> 'stage_id'
  into v_active_stage_id
  from ilka.event_log as event
  where event.expedition_id = v_expedition_id
    and event.event_type = 'stage.opened'
  order by event.stream_position desc
  limit 1;
  if v_active_stage_id is distinct from 'onboarding' then
    raise exception using errcode = '23514', message = 'stage_not_open';
  end if;
  if exists (
    select 1 from ilka.event_log as event
    where event.expedition_id = v_expedition_id
      and event.event_type = 'day.started'
  ) then
    raise exception using errcode = '23514', message = 'boundary_already_processed';
  end if;

  select document.projection_json
  into v_current_setup
  from ilka.projection_documents as document
  where document.expedition_id = v_expedition_id
    and document.projection_key = 'expedition_setup_view'
    and document.projection_version = v_current_projection_version
  for update;
  if not found
     or v_current_setup ->> 'expedition_status' is distinct from 'active'
     or v_current_setup -> 'rotation' ->> 'rotation_id' is distinct from v_rotation_id
     or coalesce((v_current_setup -> 'rotation' ->> 'rules_version')::integer, 0) <> v_rules_version then
    raise exception using errcode = '23514', message = 'scheduled_assignments_unresolvable';
  end if;

  select
    count(*)::integer,
    coalesce(jsonb_agg(participant.participant_key order by participant.participant_order), '[]'::jsonb)
  into v_active_participant_count, v_database_participant_keys
  from ilka.participants as participant
  where participant.expedition_id = v_expedition_id
    and participant.status = 'active';
  if v_active_participant_count < 3
     or v_active_participant_count > 5
     or v_participant_keys is distinct from v_database_participant_keys
     or jsonb_array_length(v_current_setup -> 'rotation' -> 'assignments') <> v_active_participant_count then
    raise exception using errcode = '23514', message = 'scheduled_assignments_unresolvable';
  end if;

  if jsonb_array_length(v_events) <> 3
     or jsonb_array_length(v_mutations) <> v_active_participant_count + 1 then
    raise exception using errcode = '23514', message = 'day_boundary_mutation_count_mismatch';
  end if;
  if v_events -> 0 ->> 'event_type' is distinct from 'day.started'
     or v_events -> 1 ->> 'event_type' is distinct from 'role_assignments.activated'
     or v_events -> 2 ->> 'event_type' is distinct from 'card_bundles.published' then
    raise exception using errcode = '23514', message = 'day_boundary_event_order_mismatch';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_events) as supplied(event_json)
    where supplied.event_json ->> 'occurred_at' is distinct from v_process_request ->> 'received_at'
       or supplied.event_json ->> 'recorded_at' is distinct from v_process_request ->> 'received_at'
       or supplied.event_json ->> 'actor_id' is distinct from 'system_clock'
       or supplied.event_json ->> 'actor_role' is distinct from 'system_clock'
       or coalesce((supplied.event_json ->> 'day_number')::integer, 0) <> 1
       or supplied.event_json ->> 'stage_id' is distinct from 'onboarding'
       or coalesce((supplied.event_json ->> 'day_revision')::integer, 0) <> 1
  ) then
    raise exception using errcode = '23514', message = 'day_boundary_event_metadata_mismatch';
  end if;
  if v_events -> 0 -> 'payload' ->> 'calendar_date' is distinct from v_local_calendar_date::text
     or (v_events -> 0 -> 'payload' ->> 'boundary_at')::timestamptz is distinct from v_boundary_at
     or v_events -> 0 -> 'payload' ->> 'stage_id' is distinct from 'onboarding' then
    raise exception using errcode = '23514', message = 'day_started_payload_mismatch';
  end if;

  v_assignment_count := jsonb_array_length(v_events -> 1 -> 'payload' -> 'assignments');
  v_bundle_count := jsonb_array_length(v_events -> 2 -> 'payload' -> 'bundles');
  if v_assignment_count <> v_active_participant_count * 2
     or v_bundle_count <> v_active_participant_count then
    raise exception using errcode = '23514', message = 'day_boundary_content_count_mismatch';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_events -> 1 -> 'payload' -> 'assignments') as supplied(assignment)
    where supplied.assignment ->> 'participant_id' not in (
      select jsonb_array_elements_text(v_participant_keys)
    )
       or supplied.assignment ->> 'role_type' not in ('product', 'onboard')
       or supplied.assignment ->> 'state' is distinct from 'active'
       or coalesce((supplied.assignment ->> 'day_number')::integer, 0) <> 1
       or supplied.assignment ->> 'stage_id' is distinct from 'onboarding'
       or supplied.assignment ->> 'assignment_id' is distinct from (
         'assignment_day_01_' || supplied.assignment ->> 'participant_id' || '_' || supplied.assignment ->> 'role_type'
       )
  ) then
    raise exception using errcode = '23514', message = 'scheduled_assignments_unresolvable';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_events -> 2 -> 'payload' -> 'bundles') as supplied(bundle)
    where supplied.bundle ->> 'participant_id' not in (
      select jsonb_array_elements_text(v_participant_keys)
    )
       or supplied.bundle ->> 'bundle_id' is distinct from (
         'bundle_day_01_' || supplied.bundle ->> 'participant_id'
       )
       or jsonb_typeof(supplied.bundle -> 'card_ids') <> 'array'
       or jsonb_typeof(supplied.bundle -> 'task_ids') <> 'array'
       or jsonb_typeof(supplied.bundle -> 'output_ids') <> 'array'
  ) then
    raise exception using errcode = '23514', message = 'card_bundle_unresolvable';
  end if;

  select
    count(*) filter (where mutation ->> 'projection_type' = 'today_view')::integer,
    count(*) filter (where mutation ->> 'projection_type' = 'captain_day_view')::integer
  into v_today_count, v_captain_count
  from jsonb_array_elements(v_mutations) as supplied(mutation);
  if v_today_count <> v_active_participant_count or v_captain_count <> 1 then
    raise exception using errcode = '23514', message = 'day_boundary_projection_set_mismatch';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_mutations) as supplied(mutation)
    where supplied.mutation ->> 'operation' is distinct from 'upsert'
       or (
         supplied.mutation ->> 'projection_type' = 'today_view'
         and (
           supplied.mutation ->> 'projection_key' is distinct from (
             'today_view:' || supplied.mutation ->> 'subject_id'
           )
           or supplied.mutation ->> 'schema_id' is distinct from 'https://ilka.local/schemas/today-view.schema.json'
           or supplied.mutation -> 'projection' ->> 'participant_id' is distinct from supplied.mutation ->> 'subject_id'
           or supplied.mutation -> 'projection' ->> 'local_date' is distinct from v_local_calendar_date::text
           or supplied.mutation -> 'projection' -> 'day' ->> 'status' is distinct from 'active'
           or supplied.mutation -> 'projection' -> 'stage' ->> 'stage_id' is distinct from 'onboarding'
         )
       )
       or (
         supplied.mutation ->> 'projection_type' = 'captain_day_view'
         and (
           supplied.mutation ->> 'projection_key' is distinct from 'captain_day_view'
           or (supplied.mutation ? 'subject_id' and supplied.mutation -> 'subject_id' <> 'null'::jsonb)
           or supplied.mutation ->> 'schema_id' is distinct from 'https://ilka.local/schemas/captain-day-view.schema.json'
           or supplied.mutation -> 'projection' ->> 'local_date' is distinct from v_local_calendar_date::text
           or supplied.mutation -> 'projection' -> 'day' ->> 'status' is distinct from 'active'
           or supplied.mutation -> 'projection' -> 'day' ->> 'transition_mode' is distinct from 'automatic'
           or coalesce((supplied.mutation -> 'projection' -> 'completion_readiness' ->> 'expected_projection_version')::bigint, -1) <> v_current_projection_version + 1
         )
       )
  ) then
    raise exception using errcode = '23514', message = 'day_boundary_projection_contract_mismatch';
  end if;

  v_result := private.process_command(v_process_request);
  if v_result ->> 'outcome' = 'conflict' then
    raise exception using errcode = '40001', message = 'version_conflict';
  end if;
  if v_result ->> 'outcome' is distinct from 'accepted'
     or coalesce((v_result -> 'receipt' ->> 'stream_position')::bigint, -1) <> v_current_stream_position + 3
     or coalesce((v_result -> 'receipt' ->> 'projection_version')::bigint, -1) <> v_current_projection_version + 1
     or jsonb_array_length(coalesce(v_result -> 'receipt' -> 'event_ids', '[]'::jsonb)) <> 3 then
    raise exception using errcode = '23514', message = 'process_day_boundary_result_invalid';
  end if;

  return v_result;
end;
$$;

comment on function private.process_day_boundary(jsonb) is
  'Atomically validates and persists the trusted system_clock Day 1 boundary through private.process_command(jsonb), publishing assignment and card-bundle events plus TodayView and CaptainDayView projections.';

revoke all on function private.process_day_boundary(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.process_day_boundary(jsonb) to service_role;

commit;
