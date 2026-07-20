begin;

create table ilka.projection_heads (
  expedition_id uuid primary key references ilka.expeditions(id) on delete restrict,
  current_projection_version bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projection_heads_version_nonnegative
    check (current_projection_version >= 0)
);

create table ilka.projection_documents (
  expedition_id uuid not null references ilka.expeditions(id) on delete restrict,
  projection_key text not null,
  projection_type text not null,
  subject_id text,
  schema_id text not null,
  schema_version text not null,
  projection_json jsonb not null,
  projection_version bigint not null,
  source_stream_position bigint not null,
  runtime_release_id uuid not null references ilka.runtime_releases(id) on delete restrict,
  reducer_version text not null,
  generated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (expedition_id, projection_key),
  constraint projection_documents_projection_key_format
    check (
      projection_key ~ '^[a-z][a-z0-9_]*(:[A-Za-z0-9_-]+)*$'
      and length(projection_key) <= 240
    ),
  constraint projection_documents_projection_type_format
    check (
      projection_type ~ '^[a-z][a-z0-9_]*$'
      and length(projection_type) <= 80
    ),
  constraint projection_documents_subject_id_valid
    check (
      subject_id is null
      or (length(btrim(subject_id)) > 0 and length(subject_id) <= 160)
    ),
  constraint projection_documents_schema_id_nonempty
    check (length(btrim(schema_id)) > 0 and length(schema_id) <= 500),
  constraint projection_documents_schema_version_nonempty
    check (length(btrim(schema_version)) > 0 and length(schema_version) <= 80),
  constraint projection_documents_json_object
    check (jsonb_typeof(projection_json) = 'object'),
  constraint projection_documents_projection_version_positive
    check (projection_version > 0),
  constraint projection_documents_stream_position_nonnegative
    check (source_stream_position >= 0),
  constraint projection_documents_reducer_version_nonempty
    check (length(btrim(reducer_version)) > 0)
);

create index projection_documents_type_subject
  on ilka.projection_documents (expedition_id, projection_type, subject_id);

create index projection_documents_source_stream
  on ilka.projection_documents (expedition_id, source_stream_position);

comment on table ilka.projection_heads is 'Expedition-wide monotonic projection version advanced once per accepted command that writes one or more projection documents.';
comment on table ilka.projection_documents is 'Rebuildable internal JSON read documents. Canonical projection shape remains owned by app/contracts schemas.';
comment on column ilka.projection_documents.projection_key is 'Stable persistence key such as captain_day_view or today_view:<participant_key>.';
comment on column ilka.projection_documents.source_stream_position is 'Final Expedition event stream position from which this complete projection document was produced.';

alter table ilka.projection_heads enable row level security;
alter table ilka.projection_heads force row level security;
alter table ilka.projection_documents enable row level security;
alter table ilka.projection_documents force row level security;

revoke all on table ilka.projection_heads from public, anon, authenticated, service_role;
revoke all on table ilka.projection_documents from public, anon, authenticated, service_role;

grant select on table ilka.projection_heads to service_role;
grant select on table ilka.projection_documents to service_role;

create or replace function private.initialize_projection_head()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into ilka.projection_heads (expedition_id)
  values (new.id)
  on conflict (expedition_id) do nothing;
  return new;
end;
$$;

create or replace function private.build_persisted_command_result(
  p_command_id text,
  p_replayed boolean,
  p_expected_stream_position bigint,
  p_projection_updates jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'outcome', receipt.status,
    'replayed', p_replayed,
    'persisted', true,
    'receipt', jsonb_build_object(
      'command_id', receipt.command_id,
      'expedition_id', receipt.expedition_id,
      'expedition_key', expedition.expedition_key,
      'command_type', receipt.command_type,
      'actor_auth_user_id', receipt.actor_auth_user_id,
      'actor_profile_id', receipt.actor_profile_id,
      'actor_membership_id', receipt.actor_membership_id,
      'actor_participant_id', receipt.actor_participant_id,
      'actor_role', receipt.actor_role,
      'request_hash', encode(receipt.request_hash, 'hex'),
      'status', receipt.status,
      'received_at', receipt.received_at,
      'processed_at', receipt.processed_at,
      'event_ids', to_jsonb(receipt.event_ids),
      'stream_position', receipt.stream_position,
      'projection_version', receipt.projection_version,
      'runtime_release_id', receipt.runtime_release_id,
      'reducer_version', receipt.reducer_version,
      'rejection_code', receipt.rejection_code,
      'rejection_message', receipt.rejection_message,
      'conflict_code', receipt.conflict_code
    ),
    'projection_updates', coalesce(p_projection_updates, '[]'::jsonb),
    'expected_stream_position', p_expected_stream_position,
    'current_stream_position', receipt.stream_position
  )
  from ilka.command_receipts as receipt
  join ilka.expeditions as expedition
    on expedition.id = receipt.expedition_id
  where receipt.command_id = p_command_id;
$$;

create or replace function private.process_command(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_command jsonb;
  v_actor jsonb;
  v_events jsonb;
  v_projection_mutations jsonb;
  v_rejection jsonb;
  v_expedition_id uuid;
  v_expedition_key text;
  v_pinned_runtime_release_id uuid;
  v_registered_reducer_version text;
  v_runtime_release_id uuid;
  v_reducer_version text;
  v_command_id text;
  v_command_type text;
  v_canonical_actor_id text;
  v_actor_role text;
  v_actor_auth_user_id uuid;
  v_actor_profile_id uuid;
  v_actor_membership_id uuid;
  v_actor_participant_id uuid;
  v_request_hash_hex text;
  v_request_hash bytea;
  v_expected_stream_position bigint;
  v_current_stream_position bigint;
  v_current_projection_version bigint;
  v_final_stream_position bigint;
  v_final_projection_version bigint;
  v_status text;
  v_received_at timestamptz;
  v_processed_at timestamptz;
  v_rejection_code text;
  v_rejection_message text;
  v_event_count integer;
  v_projection_mutation_count integer;
  v_event_ids text[];
  v_existing_receipt ilka.command_receipts%rowtype;
  v_resolved_actor record;
  v_participant_key text;
  v_event record;
  v_mutation record;
  v_projection_updates jsonb := '[]'::jsonb;
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'invalid_process_command_request';
  end if;

  v_command := p_request -> 'command';
  v_actor := p_request -> 'actor_context';
  v_events := coalesce(p_request -> 'events', '[]'::jsonb);
  v_projection_mutations := coalesce(p_request -> 'projection_mutations', '[]'::jsonb);
  v_rejection := p_request -> 'rejection';

  if jsonb_typeof(v_command) <> 'object'
     or jsonb_typeof(v_actor) <> 'object'
     or jsonb_typeof(v_events) <> 'array'
     or jsonb_typeof(v_projection_mutations) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'invalid_process_command_request_shape';
  end if;

  v_expedition_id := nullif(p_request ->> 'expedition_id', '')::uuid;
  v_runtime_release_id := nullif(p_request ->> 'runtime_release_id', '')::uuid;
  v_reducer_version := p_request ->> 'reducer_version';
  v_command_id := v_command ->> 'command_id';
  v_command_type := v_command ->> 'command_type';
  v_canonical_actor_id := v_actor ->> 'actor_id';
  v_actor_role := v_actor ->> 'actor_role';
  v_actor_auth_user_id := nullif(v_actor ->> 'auth_user_id', '')::uuid;
  v_actor_profile_id := nullif(v_actor ->> 'profile_id', '')::uuid;
  v_actor_membership_id := nullif(v_actor ->> 'membership_id', '')::uuid;
  v_actor_participant_id := nullif(v_actor ->> 'participant_id', '')::uuid;
  v_request_hash_hex := p_request ->> 'request_hash';
  v_expected_stream_position := (p_request ->> 'expected_stream_position')::bigint;
  v_status := p_request ->> 'status';
  v_received_at := (p_request ->> 'received_at')::timestamptz;
  v_processed_at := (p_request ->> 'processed_at')::timestamptz;

  if v_expedition_id is null then
    raise exception using errcode = '22023', message = 'invalid_expedition_id';
  end if;

  if v_command_id is null or v_command_id !~ '^cmd_[A-Za-z0-9_-]+$' then
    raise exception using errcode = '22023', message = 'invalid_command_id';
  end if;

  if v_command_type is null or v_command_type !~ '^[a-z][a-z0-9_]*$' then
    raise exception using errcode = '22023', message = 'invalid_command_type';
  end if;

  if v_canonical_actor_id is null or length(btrim(v_canonical_actor_id)) = 0 then
    raise exception using errcode = '22023', message = 'invalid_actor_id';
  end if;

  if v_actor_role not in (
    'captain',
    'product_captain',
    'participant',
    'shore_operator',
    'system',
    'system_clock'
  ) then
    raise exception using errcode = '22023', message = 'invalid_actor_role';
  end if;

  if v_request_hash_hex is null or v_request_hash_hex !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_request_hash';
  end if;
  v_request_hash := decode(v_request_hash_hex, 'hex');

  if v_expected_stream_position is null or v_expected_stream_position < 0 then
    raise exception using
      errcode = '22023',
      message = 'invalid_expected_stream_position';
  end if;

  if v_runtime_release_id is null then
    raise exception using errcode = '22023', message = 'invalid_runtime_release_id';
  end if;

  if v_reducer_version is null or length(btrim(v_reducer_version)) = 0 then
    raise exception using errcode = '22023', message = 'invalid_reducer_version';
  end if;

  if v_status not in ('accepted', 'rejected') then
    raise exception using errcode = '22023', message = 'invalid_process_command_status';
  end if;

  if v_received_at is null or v_processed_at is null or v_processed_at < v_received_at then
    raise exception using errcode = '22023', message = 'invalid_processing_timestamps';
  end if;

  v_event_count := jsonb_array_length(v_events);
  v_projection_mutation_count := jsonb_array_length(v_projection_mutations);

  if v_status = 'accepted' then
    if v_event_count = 0 then
      raise exception using errcode = '22023', message = 'accepted_command_requires_events';
    end if;
    if v_rejection is not null and jsonb_typeof(v_rejection) <> 'null' then
      raise exception using errcode = '22023', message = 'accepted_command_cannot_include_rejection';
    end if;
  else
    if v_event_count <> 0 or v_projection_mutation_count <> 0 then
      raise exception using errcode = '22023', message = 'rejected_command_cannot_mutate_state';
    end if;
    if jsonb_typeof(v_rejection) <> 'object' then
      raise exception using errcode = '22023', message = 'rejected_command_requires_rejection';
    end if;
    v_rejection_code := v_rejection ->> 'code';
    v_rejection_message := v_rejection ->> 'message';
    if v_rejection_code is null or length(btrim(v_rejection_code)) = 0 then
      raise exception using errcode = '22023', message = 'rejected_command_requires_code';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ilka:command:' || v_command_id, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ilka:expedition:' || v_expedition_id::text, 0)
  );

  select
    expedition.expedition_key,
    expedition.runtime_release_id,
    release.reducer_version
  into
    v_expedition_key,
    v_pinned_runtime_release_id,
    v_registered_reducer_version
  from ilka.expeditions as expedition
  join ilka.runtime_releases as release
    on release.id = expedition.runtime_release_id
  where expedition.id = v_expedition_id;

  if not found then
    raise exception using errcode = '23503', message = 'expedition_not_found';
  end if;

  select receipt.*
  into v_existing_receipt
  from ilka.command_receipts as receipt
  where receipt.command_id = v_command_id;

  if found then
    if v_existing_receipt.expedition_id = v_expedition_id
       and v_existing_receipt.request_hash = v_request_hash then
      return private.build_persisted_command_result(
        v_command_id,
        true,
        v_expected_stream_position,
        '[]'::jsonb
      );
    end if;

    select head.current_stream_position
    into v_current_stream_position
    from ilka.stream_heads as head
    where head.expedition_id = v_expedition_id;

    select head.current_projection_version
    into v_current_projection_version
    from ilka.projection_heads as head
    where head.expedition_id = v_expedition_id;

    return jsonb_build_object(
      'outcome', 'rejected',
      'replayed', false,
      'persisted', false,
      'receipt', jsonb_build_object(
        'command_id', v_command_id,
        'expedition_id', v_expedition_id,
        'expedition_key', v_expedition_key,
        'command_type', v_command_type,
        'actor_auth_user_id', v_actor_auth_user_id,
        'actor_profile_id', v_actor_profile_id,
        'actor_membership_id', v_actor_membership_id,
        'actor_participant_id', v_actor_participant_id,
        'actor_role', v_actor_role,
        'request_hash', v_request_hash_hex,
        'status', 'rejected',
        'received_at', v_received_at,
        'processed_at', v_processed_at,
        'event_ids', '[]'::jsonb,
        'stream_position', v_current_stream_position,
        'projection_version', v_current_projection_version,
        'runtime_release_id', v_pinned_runtime_release_id,
        'reducer_version', v_registered_reducer_version,
        'rejection_code', 'idempotency_key_reused_with_different_payload',
        'rejection_message', null,
        'conflict_code', null
      ),
      'projection_updates', '[]'::jsonb,
      'expected_stream_position', v_expected_stream_position,
      'current_stream_position', v_current_stream_position
    );
  end if;

  if v_runtime_release_id <> v_pinned_runtime_release_id then
    raise exception using
      errcode = '23514',
      message = 'runtime_release_mismatch';
  end if;

  if v_reducer_version <> v_registered_reducer_version then
    raise exception using
      errcode = '23514',
      message = 'reducer_version_mismatch';
  end if;

  if v_command ->> 'expedition_id' is distinct from v_expedition_key then
    raise exception using
      errcode = '23514',
      message = 'command_expedition_mismatch';
  end if;

  if v_command ->> 'actor_id' is distinct from v_canonical_actor_id
     or v_command ->> 'actor_role' is distinct from v_actor_role then
    raise exception using
      errcode = '23514',
      message = 'command_actor_context_mismatch';
  end if;

  if v_actor_role in ('system', 'system_clock') then
    if v_actor_auth_user_id is not null
       or v_actor_profile_id is not null
       or v_actor_membership_id is not null
       or v_actor_participant_id is not null then
      raise exception using
        errcode = '23514',
        message = 'system_actor_context_mismatch';
    end if;
  else
    if v_actor_auth_user_id is null
       or v_actor_profile_id is null
       or v_actor_membership_id is null then
      raise exception using
        errcode = '23514',
        message = 'human_actor_context_incomplete';
    end if;

    select resolved.*
    into v_resolved_actor
    from private.resolve_actor_context(v_actor_auth_user_id, v_expedition_id) as resolved;

    if not found
       or v_resolved_actor.profile_id is distinct from v_actor_profile_id
       or v_resolved_actor.expedition_member_id is distinct from v_actor_membership_id
       or v_resolved_actor.participant_id is distinct from v_actor_participant_id then
      raise exception using
        errcode = '42501',
        message = 'actor_context_mismatch';
    end if;

    if v_actor_participant_id is not null then
      select participant.participant_key
      into v_participant_key
      from ilka.participants as participant
      where participant.id = v_actor_participant_id
        and participant.expedition_id = v_expedition_id;

      if v_participant_key is distinct from v_canonical_actor_id then
        raise exception using
          errcode = '23514',
          message = 'participant_actor_id_mismatch';
      end if;
    end if;
  end if;

  begin
    v_current_stream_position := private.assert_expected_stream_position(
      v_expedition_id,
      v_expected_stream_position
    );
  exception
    when serialization_failure then
      select head.current_stream_position
      into v_current_stream_position
      from ilka.stream_heads as head
      where head.expedition_id = v_expedition_id;

      select head.current_projection_version
      into v_current_projection_version
      from ilka.projection_heads as head
      where head.expedition_id = v_expedition_id;

      return jsonb_build_object(
        'outcome', 'conflict',
        'replayed', false,
        'persisted', false,
        'receipt', jsonb_build_object(
          'command_id', v_command_id,
          'expedition_id', v_expedition_id,
          'expedition_key', v_expedition_key,
          'command_type', v_command_type,
          'actor_auth_user_id', v_actor_auth_user_id,
          'actor_profile_id', v_actor_profile_id,
          'actor_membership_id', v_actor_membership_id,
          'actor_participant_id', v_actor_participant_id,
          'actor_role', v_actor_role,
          'request_hash', v_request_hash_hex,
          'status', 'conflict',
          'received_at', v_received_at,
          'processed_at', v_processed_at,
          'event_ids', '[]'::jsonb,
          'stream_position', v_current_stream_position,
          'projection_version', v_current_projection_version,
          'runtime_release_id', v_pinned_runtime_release_id,
          'reducer_version', v_registered_reducer_version,
          'rejection_code', null,
          'rejection_message', null,
          'conflict_code', 'stream_position_conflict'
        ),
        'projection_updates', '[]'::jsonb,
        'expected_stream_position', v_expected_stream_position,
        'current_stream_position', v_current_stream_position
      );
  end;

  select head.current_projection_version
  into v_current_projection_version
  from ilka.projection_heads as head
  where head.expedition_id = v_expedition_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'projection_head_not_found';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_events) as supplied(event_json)
    where jsonb_typeof(supplied.event_json) <> 'object'
       or supplied.event_json ->> 'event_id' is null
       or supplied.event_json ->> 'event_type' is null
       or supplied.event_json ->> 'command_id' is distinct from v_command_id
       or supplied.event_json ->> 'expedition_id' is distinct from v_expedition_key
       or supplied.event_json ->> 'actor_id' is distinct from v_canonical_actor_id
       or supplied.event_json ->> 'actor_role' is distinct from v_actor_role
  ) then
    raise exception using errcode = '23514', message = 'prepared_event_metadata_mismatch';
  end if;

  select
    coalesce(array_agg(supplied.event_json ->> 'event_id' order by supplied.ordinality), array[]::text[]),
    count(*)::integer
  into v_event_ids, v_event_count
  from jsonb_array_elements(v_events) with ordinality
    as supplied(event_json, ordinality);

  if cardinality(v_event_ids) <> (
    select count(distinct event_id)
    from unnest(v_event_ids) as event_id
  ) then
    raise exception using errcode = '23514', message = 'prepared_event_ids_must_be_unique';
  end if;

  if exists (
    select 1
    from unnest(v_event_ids) as event_id
    where event_id is null or event_id !~ '^evt_[A-Za-z0-9_-]+$'
  ) then
    raise exception using errcode = '23514', message = 'prepared_event_id_invalid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_projection_mutations) as supplied(mutation)
    where jsonb_typeof(supplied.mutation) <> 'object'
       or supplied.mutation ->> 'operation' is distinct from 'upsert'
       or supplied.mutation ->> 'projection_key' is null
       or supplied.mutation ->> 'projection_key' !~ '^[a-z][a-z0-9_]*(:[A-Za-z0-9_-]+)*$'
       or length(supplied.mutation ->> 'projection_key') > 240
       or supplied.mutation ->> 'projection_type' is null
       or supplied.mutation ->> 'projection_type' !~ '^[a-z][a-z0-9_]*$'
       or length(supplied.mutation ->> 'projection_type') > 80
       or supplied.mutation ->> 'schema_id' is null
       or length(btrim(supplied.mutation ->> 'schema_id')) = 0
       or supplied.mutation ->> 'schema_version' is null
       or length(btrim(supplied.mutation ->> 'schema_version')) = 0
       or jsonb_typeof(supplied.mutation -> 'projection') <> 'object'
       or (
         supplied.mutation -> 'projection' ? 'expedition_id'
         and supplied.mutation -> 'projection' ->> 'expedition_id' is distinct from v_expedition_key
       )
       or (
         supplied.mutation ? 'subject_id'
         and supplied.mutation -> 'subject_id' <> 'null'::jsonb
         and (
           supplied.mutation ->> 'subject_id' is null
           or length(btrim(supplied.mutation ->> 'subject_id')) = 0
           or length(supplied.mutation ->> 'subject_id') > 160
         )
       )
  ) then
    raise exception using errcode = '23514', message = 'invalid_projection_mutation';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(v_projection_mutations)
  ) <> (
    select count(distinct supplied.mutation ->> 'projection_key')
    from jsonb_array_elements(v_projection_mutations) as supplied(mutation)
  ) then
    raise exception using errcode = '23514', message = 'duplicate_projection_mutation_key';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_projection_mutations) as supplied(mutation)
    join ilka.projection_documents as existing
      on existing.expedition_id = v_expedition_id
     and existing.projection_key = supplied.mutation ->> 'projection_key'
    where existing.projection_type is distinct from supplied.mutation ->> 'projection_type'
       or existing.subject_id is distinct from nullif(supplied.mutation ->> 'subject_id', '')
       or existing.schema_id is distinct from supplied.mutation ->> 'schema_id'
  ) then
    raise exception using errcode = '23514', message = 'projection_identity_mismatch';
  end if;

  if v_status = 'accepted' then
    v_final_stream_position := v_current_stream_position + v_event_count;
    if v_projection_mutation_count > 0 then
      v_final_projection_version := v_current_projection_version + 1;
    else
      v_final_projection_version := v_current_projection_version;
    end if;
  else
    v_final_stream_position := v_current_stream_position;
    v_final_projection_version := v_current_projection_version;
  end if;

  insert into ilka.command_receipts (
    command_id,
    expedition_id,
    command_type,
    actor_auth_user_id,
    actor_profile_id,
    actor_membership_id,
    actor_participant_id,
    actor_role,
    request_hash,
    status,
    received_at,
    processed_at,
    event_ids,
    stream_position,
    projection_version,
    runtime_release_id,
    reducer_version,
    rejection_code,
    rejection_message,
    conflict_code
  ) values (
    v_command_id,
    v_expedition_id,
    v_command_type,
    v_actor_auth_user_id,
    v_actor_profile_id,
    v_actor_membership_id,
    v_actor_participant_id,
    v_actor_role,
    v_request_hash,
    v_status,
    v_received_at,
    v_processed_at,
    case when v_status = 'accepted' then v_event_ids else array[]::text[] end,
    v_final_stream_position,
    v_final_projection_version,
    v_runtime_release_id,
    v_reducer_version,
    v_rejection_code,
    v_rejection_message,
    null
  );

  if v_status = 'accepted' then
    for v_event in
      select supplied.event_json, supplied.ordinality
      from jsonb_array_elements(v_events) with ordinality
        as supplied(event_json, ordinality)
      order by supplied.ordinality
    loop
      insert into ilka.event_log (
        event_id,
        expedition_id,
        stream_position,
        command_id,
        event_type,
        occurred_at,
        recorded_at,
        actor_auth_user_id,
        actor_profile_id,
        actor_membership_id,
        actor_participant_id,
        actor_role,
        causation_id,
        correlation_id,
        event_json,
        correction_of_event_id,
        runtime_release_id,
        reducer_version
      ) values (
        v_event.event_json ->> 'event_id',
        v_expedition_id,
        v_current_stream_position + v_event.ordinality,
        v_command_id,
        v_event.event_json ->> 'event_type',
        (v_event.event_json ->> 'occurred_at')::timestamptz,
        (v_event.event_json ->> 'recorded_at')::timestamptz,
        v_actor_auth_user_id,
        v_actor_profile_id,
        v_actor_membership_id,
        v_actor_participant_id,
        v_actor_role,
        nullif(v_event.event_json ->> 'causation_id', ''),
        nullif(v_event.event_json ->> 'correlation_id', ''),
        v_event.event_json,
        nullif(v_event.event_json ->> 'correction_of', ''),
        v_runtime_release_id,
        v_reducer_version
      );
    end loop;

    if v_projection_mutation_count > 0 then
      for v_mutation in
        select supplied.mutation, supplied.ordinality
        from jsonb_array_elements(v_projection_mutations) with ordinality
          as supplied(mutation, ordinality)
        order by supplied.ordinality
      loop
        insert into ilka.projection_documents (
          expedition_id,
          projection_key,
          projection_type,
          subject_id,
          schema_id,
          schema_version,
          projection_json,
          projection_version,
          source_stream_position,
          runtime_release_id,
          reducer_version,
          generated_at,
          updated_at
        ) values (
          v_expedition_id,
          v_mutation.mutation ->> 'projection_key',
          v_mutation.mutation ->> 'projection_type',
          nullif(v_mutation.mutation ->> 'subject_id', ''),
          v_mutation.mutation ->> 'schema_id',
          v_mutation.mutation ->> 'schema_version',
          v_mutation.mutation -> 'projection',
          v_final_projection_version,
          v_final_stream_position,
          v_runtime_release_id,
          v_reducer_version,
          v_processed_at,
          v_processed_at
        )
        on conflict (expedition_id, projection_key)
        do update set
          schema_version = excluded.schema_version,
          projection_json = excluded.projection_json,
          projection_version = excluded.projection_version,
          source_stream_position = excluded.source_stream_position,
          runtime_release_id = excluded.runtime_release_id,
          reducer_version = excluded.reducer_version,
          generated_at = excluded.generated_at,
          updated_at = excluded.updated_at;

        v_projection_updates := v_projection_updates || jsonb_build_array(
          jsonb_build_object(
            'projection_key', v_mutation.mutation ->> 'projection_key',
            'projection_version', v_final_projection_version,
            'source_stream_position', v_final_stream_position
          )
        );
      end loop;

      update ilka.projection_heads
      set current_projection_version = v_final_projection_version,
          updated_at = v_processed_at
      where expedition_id = v_expedition_id;
    end if;
  end if;

  return private.build_persisted_command_result(
    v_command_id,
    false,
    v_expected_stream_position,
    v_projection_updates
  );
end;
$$;

revoke all on function private.initialize_projection_head() from public, anon, authenticated;
revoke all on function private.build_persisted_command_result(text, boolean, bigint, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.process_command(jsonb) from public, anon, authenticated;
grant execute on function private.process_command(jsonb) to service_role;

create trigger expeditions_initialize_projection_head
after insert on ilka.expeditions
for each row execute function private.initialize_projection_head();

insert into ilka.projection_heads (expedition_id)
select expedition.id
from ilka.expeditions as expedition
on conflict (expedition_id) do nothing;

commit;
