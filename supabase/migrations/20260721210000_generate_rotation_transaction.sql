begin;

create or replace function private.generate_rotation(p_request jsonb)
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
  v_rotation_event jsonb;
  v_ready_event jsonb;
  v_rotation_payload jsonb;
  v_ready_payload jsonb;
  v_mutation jsonb;
  v_projection jsonb;
  v_projection_rotation jsonb;
  v_projection_readiness jsonb;
  v_projection_controls jsonb;
  v_expedition_id uuid;
  v_process_expedition_id uuid;
  v_actor_auth_user_id uuid;
  v_actor_profile_id uuid;
  v_actor_membership_id uuid;
  v_runtime_release_id uuid;
  v_command_id text;
  v_request_hash_hex text;
  v_request_hash bytea;
  v_rotation_id text;
  v_rules_version integer;
  v_expedition_key text;
  v_expedition_status text;
  v_pinned_runtime_release_id uuid;
  v_registered_reducer_version text;
  v_current_stream_position bigint;
  v_current_projection_version bigint;
  v_expected_actor_id text;
  v_active_participant_count integer;
  v_distinct_order_count integer;
  v_min_participant_order integer;
  v_max_participant_order integer;
  v_assignment_count integer;
  v_distinct_assignment_participant_count integer;
  v_distinct_onboard_role_count integer;
  v_product_captain_count integer;
  v_result jsonb;
  v_existing_receipt record;
  v_resolved_actor record;
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_generate_rotation_request';
  end if;

  v_transition := p_request -> 'expedition_transition';
  v_process_request := p_request -> 'process_command_request';
  if jsonb_typeof(v_transition) <> 'object'
     or jsonb_typeof(v_process_request) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_generate_rotation_request_shape';
  end if;

  v_command := v_process_request -> 'command';
  v_actor := v_process_request -> 'actor_context';
  v_events := coalesce(v_process_request -> 'events', '[]'::jsonb);
  v_mutations := coalesce(v_process_request -> 'projection_mutations', '[]'::jsonb);
  if jsonb_typeof(v_command) <> 'object'
     or jsonb_typeof(v_actor) <> 'object'
     or jsonb_typeof(v_events) <> 'array'
     or jsonb_typeof(v_mutations) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_generate_rotation_process_shape';
  end if;

  begin
    v_expedition_id := nullif(v_transition ->> 'expedition_id', '')::uuid;
    v_process_expedition_id := nullif(v_process_request ->> 'expedition_id', '')::uuid;
    v_actor_auth_user_id := nullif(v_actor ->> 'auth_user_id', '')::uuid;
    v_actor_profile_id := nullif(v_actor ->> 'profile_id', '')::uuid;
    v_actor_membership_id := nullif(v_actor ->> 'membership_id', '')::uuid;
    v_runtime_release_id := nullif(v_process_request ->> 'runtime_release_id', '')::uuid;
    v_rules_version := nullif(v_transition ->> 'rules_version', '')::integer;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = '22023', message = 'invalid_generate_rotation_identifier';
  end;

  v_command_id := v_command ->> 'command_id';
  v_request_hash_hex := v_process_request ->> 'request_hash';
  v_rotation_id := v_transition ->> 'rotation_id';

  if v_expedition_id is null
     or v_process_expedition_id is distinct from v_expedition_id
     or v_actor_auth_user_id is null
     or v_actor_profile_id is null
     or v_actor_membership_id is null
     or v_runtime_release_id is null
     or v_rules_version is null then
    raise exception using errcode = '22023', message = 'generate_rotation_required_identifier_missing';
  end if;
  if v_transition ->> 'expected_status' is distinct from 'draft'
     or v_transition ->> 'next_status' is distinct from 'ready'
     or v_rotation_id is null
     or v_rotation_id !~ '^rotation_[0-9a-f]{32}$'
     or v_rules_version < 1 then
    raise exception using errcode = '22023', message = 'invalid_generate_rotation_transition';
  end if;
  if v_command_id is null
     or v_command_id !~ '^cmd_[A-Za-z0-9_-]+$'
     or v_command ->> 'idempotency_key' is distinct from v_command_id then
    raise exception using errcode = '22023', message = 'invalid_generate_rotation_command_id';
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
  where expedition.id = v_expedition_id
  for update of expedition;

  if not found then
    raise exception using errcode = '23503', message = 'expedition_not_found';
  end if;
  if v_expedition_status <> 'draft' then
    if exists (
      select 1
      from ilka.event_log as event
      where event.expedition_id = v_expedition_id
        and event.event_type = 'rotation.generated'
    ) then
      raise exception using errcode = '23514', message = 'rotation_already_generated';
    end if;
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
     or v_resolved_actor.participant_id is not null then
    raise exception using errcode = '42501', message = 'active_captain_membership_required';
  end if;

  v_expected_actor_id := 'member_' || replace(v_actor_membership_id::text, '-', '');
  if v_command ->> 'command_type' is distinct from 'generate_rotation'
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
    raise exception using errcode = '23514', message = 'invalid_generate_rotation_process_contract';
  end if;

  select
    count(*)::integer,
    count(distinct participant.participant_order)::integer,
    min(participant.participant_order)::integer,
    max(participant.participant_order)::integer
  into
    v_active_participant_count,
    v_distinct_order_count,
    v_min_participant_order,
    v_max_participant_order
  from ilka.participants as participant
  where participant.expedition_id = v_expedition_id
    and participant.status = 'active';

  if v_active_participant_count < 3 or v_active_participant_count > 5 then
    raise exception using errcode = '23514', message = 'rotation_not_ready';
  end if;
  if v_distinct_order_count <> v_active_participant_count
     or v_min_participant_order < 1
     or v_max_participant_order > 5 then
    raise exception using errcode = '23514', message = 'participant_order_unavailable';
  end if;
  if exists (
    select 1
    from ilka.invitations as invitation
    where invitation.expedition_id = v_expedition_id
      and invitation.status = 'pending'
  ) then
    raise exception using errcode = '23514', message = 'pending_invitations_exist';
  end if;
  if exists (
    select 1
    from ilka.event_log as event
    where event.expedition_id = v_expedition_id
      and event.event_type = 'rotation.generated'
  ) then
    raise exception using errcode = '23514', message = 'rotation_already_generated';
  end if;

  if jsonb_array_length(v_events) <> 2 or jsonb_array_length(v_mutations) <> 1 then
    raise exception using errcode = '23514', message = 'invalid_generate_rotation_mutation_count';
  end if;

  v_rotation_event := v_events -> 0;
  v_ready_event := v_events -> 1;
  v_rotation_payload := v_rotation_event -> 'payload';
  v_ready_payload := v_ready_event -> 'payload';
  if v_rotation_event ->> 'event_type' is distinct from 'rotation.generated'
     or v_ready_event ->> 'event_type' is distinct from 'expedition.ready'
     or v_rotation_payload ->> 'rotation_id' is distinct from v_rotation_id
     or v_ready_payload ->> 'rotation_id' is distinct from v_rotation_id
     or coalesce((v_rotation_payload ->> 'rules_version')::integer, -1) <> v_rules_version
     or coalesce(v_rotation_payload ->> 'seed', '') !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(v_rotation_payload -> 'assignments') <> 'array' then
    raise exception using errcode = '23514', message = 'rotation_event_contract_mismatch';
  end if;

  select
    jsonb_array_length(v_rotation_payload -> 'assignments'),
    count(distinct assignment ->> 'participant_id')::integer,
    count(distinct assignment ->> 'onboard_role_id')::integer,
    count(*) filter (where assignment ->> 'product_role_id' = 'product_captain')::integer
  into
    v_assignment_count,
    v_distinct_assignment_participant_count,
    v_distinct_onboard_role_count,
    v_product_captain_count
  from jsonb_array_elements(v_rotation_payload -> 'assignments') as assignment;

  if v_assignment_count <> v_active_participant_count
     or v_distinct_assignment_participant_count <> v_active_participant_count
     or v_distinct_onboard_role_count <> v_active_participant_count
     or v_product_captain_count <> 1 then
    raise exception using errcode = '23514', message = 'rotation_assignment_count_mismatch';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_rotation_payload -> 'assignments') as assignment
    where assignment ->> 'product_role_id' not in ('product_captain', 'product_support')
       or assignment ->> 'onboard_role_id' not in ('navigation', 'mooring', 'order', 'cook', 'product_focus')
       or (
         assignment ->> 'onboard_role_id' = 'cook'
         and assignment ->> 'product_role_id' <> 'product_support'
       )
       or not exists (
         select 1
         from ilka.participants as participant
         where participant.expedition_id = v_expedition_id
           and participant.status = 'active'
           and participant.participant_key = assignment ->> 'participant_id'
       )
  ) then
    raise exception using errcode = '23514', message = 'rotation_assignment_contract_mismatch';
  end if;

  v_mutation := v_mutations -> 0;
  v_projection := v_mutation -> 'projection';
  v_projection_rotation := v_projection -> 'rotation';
  v_projection_readiness := v_projection -> 'readiness';
  v_projection_controls := v_projection -> 'controls';
  if v_mutation ->> 'operation' is distinct from 'upsert'
     or v_mutation ->> 'projection_key' is distinct from 'expedition_setup_view'
     or v_mutation ->> 'projection_type' is distinct from 'expedition_setup_view'
     or (v_mutation ? 'subject_id' and v_mutation -> 'subject_id' <> 'null'::jsonb)
     or v_mutation ->> 'schema_id' is distinct from 'https://ilka.local/schemas/expedition-setup-view.schema.json'
     or v_mutation ->> 'schema_version' is distinct from '1'
     or jsonb_typeof(v_projection) <> 'object'
     or v_projection ->> 'expedition_id' is distinct from v_expedition_key
     or v_projection ->> 'expedition_status' is distinct from 'ready'
     or (v_projection ->> 'expected_projection_version')::bigint is distinct from v_current_projection_version + 1
     or v_projection ->> 'sync_status' is distinct from 'synced'
     or v_projection_rotation ->> 'status' is distinct from 'generated'
     or v_projection_rotation ->> 'rotation_id' is distinct from v_rotation_id
     or coalesce((v_projection_rotation ->> 'rules_version')::integer, -1) <> v_rules_version
     or v_projection_rotation -> 'assignments' is distinct from v_rotation_payload -> 'assignments'
     or coalesce((v_projection_readiness ->> 'can_generate_rotation')::boolean, true)
     or not coalesce((v_projection_readiness ->> 'can_start_expedition')::boolean, false)
     or jsonb_array_length(coalesce(v_projection_readiness -> 'blockers', '[]'::jsonb)) <> 0
     or coalesce((v_projection_controls ->> 'invite_participant')::boolean, true)
     or coalesce((v_projection_controls ->> 'revoke_invitation')::boolean, true)
     or coalesce((v_projection_controls ->> 'generate_rotation')::boolean, true)
     or not coalesce((v_projection_controls ->> 'start_expedition')::boolean, false) then
    raise exception using errcode = '23514', message = 'expedition_ready_projection_mismatch';
  end if;

  v_result := private.process_command(v_process_request);
  if v_result ->> 'outcome' = 'conflict' then
    raise exception using errcode = '40001', message = 'version_conflict';
  end if;
  if v_result ->> 'outcome' is distinct from 'accepted'
     or coalesce((v_result -> 'receipt' ->> 'stream_position')::bigint, -1) <> v_current_stream_position + 2
     or coalesce((v_result -> 'receipt' ->> 'projection_version')::bigint, -1) <> v_current_projection_version + 1
     or jsonb_array_length(coalesce(v_result -> 'receipt' -> 'event_ids', '[]'::jsonb)) <> 2 then
    raise exception using errcode = '23514', message = 'generate_rotation_process_result_invalid';
  end if;

  update ilka.expeditions as expedition
  set status = 'ready', updated_at = now()
  where expedition.id = v_expedition_id
    and expedition.status = 'draft';
  if not found then
    raise exception using errcode = '40001', message = 'version_conflict';
  end if;

  return v_result;
end;
$$;

comment on function private.generate_rotation(jsonb) is
  'Atomically persists rotation.generated and expedition.ready through private.process_command(jsonb), replaces ExpeditionSetupView and transitions one draft Expedition to ready.';

revoke all on function private.generate_rotation(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.generate_rotation(jsonb) to service_role;

commit;
