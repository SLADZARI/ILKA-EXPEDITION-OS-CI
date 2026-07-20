begin;

alter table ilka.participants
  add constraint participants_id_expedition_unique
  unique (id, expedition_id);

create table ilka.stream_heads (
  expedition_id uuid primary key references ilka.expeditions(id) on delete restrict,
  current_stream_position bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stream_heads_position_nonnegative
    check (current_stream_position >= 0)
);

create table ilka.command_receipts (
  command_id text primary key,
  expedition_id uuid not null references ilka.expeditions(id) on delete restrict,
  command_type text not null,
  actor_auth_user_id uuid,
  actor_profile_id uuid references ilka.profiles(id) on delete restrict,
  actor_membership_id uuid,
  actor_participant_id uuid,
  actor_role text not null,
  request_hash bytea not null,
  status text not null,
  received_at timestamptz not null,
  processed_at timestamptz not null,
  event_ids text[] not null default array[]::text[],
  stream_position bigint,
  projection_version bigint,
  runtime_release_id uuid not null references ilka.runtime_releases(id) on delete restrict,
  reducer_version text not null,
  rejection_code text,
  rejection_message text,
  conflict_code text,
  created_at timestamptz not null default now(),
  constraint command_receipts_command_expedition_unique
    unique (command_id, expedition_id),
  constraint command_receipts_actor_membership_expedition_fk
    foreign key (actor_membership_id, expedition_id)
    references ilka.expedition_members(id, expedition_id)
    on delete restrict,
  constraint command_receipts_actor_participant_expedition_fk
    foreign key (actor_participant_id, expedition_id)
    references ilka.participants(id, expedition_id)
    on delete restrict,
  constraint command_receipts_command_id_format
    check (command_id ~ '^cmd_[A-Za-z0-9_-]+$'),
  constraint command_receipts_command_type_format
    check (command_type ~ '^[a-z][a-z0-9_]*$'),
  constraint command_receipts_actor_role_nonempty
    check (length(btrim(actor_role)) > 0),
  constraint command_receipts_request_hash_sha256
    check (octet_length(request_hash) = 32),
  constraint command_receipts_status_valid
    check (status in ('accepted', 'rejected', 'conflict')),
  constraint command_receipts_processed_after_received
    check (processed_at >= received_at),
  constraint command_receipts_event_ids_no_nulls
    check (array_position(event_ids, null) is null),
  constraint command_receipts_stream_position_nonnegative
    check (stream_position is null or stream_position >= 0),
  constraint command_receipts_projection_version_nonnegative
    check (projection_version is null or projection_version >= 0),
  constraint command_receipts_reducer_version_nonempty
    check (length(btrim(reducer_version)) > 0),
  constraint command_receipts_status_metadata_consistent
    check (
      (
        status = 'accepted'
        and stream_position is not null
        and rejection_code is null
        and rejection_message is null
        and conflict_code is null
      )
      or (
        status = 'rejected'
        and length(btrim(rejection_code)) > 0
        and conflict_code is null
        and cardinality(event_ids) = 0
      )
      or (
        status = 'conflict'
        and length(btrim(conflict_code)) > 0
        and rejection_code is null
        and rejection_message is null
        and cardinality(event_ids) = 0
      )
    )
);

create index command_receipts_expedition_received
  on ilka.command_receipts (expedition_id, received_at desc);

create index command_receipts_actor_profile
  on ilka.command_receipts (actor_profile_id, received_at desc)
  where actor_profile_id is not null;

create table ilka.event_log (
  event_id text primary key,
  expedition_id uuid not null references ilka.expeditions(id) on delete restrict,
  stream_position bigint not null,
  command_id text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null,
  actor_auth_user_id uuid,
  actor_profile_id uuid references ilka.profiles(id) on delete restrict,
  actor_membership_id uuid,
  actor_participant_id uuid,
  actor_role text not null,
  causation_id text,
  correlation_id text,
  event_json jsonb not null,
  correction_of_event_id text references ilka.event_log(event_id) on delete restrict,
  runtime_release_id uuid not null references ilka.runtime_releases(id) on delete restrict,
  reducer_version text not null,
  created_at timestamptz not null default now(),
  constraint event_log_expedition_position_unique
    unique (expedition_id, stream_position),
  constraint event_log_command_expedition_fk
    foreign key (command_id, expedition_id)
    references ilka.command_receipts(command_id, expedition_id)
    on delete restrict,
  constraint event_log_actor_membership_expedition_fk
    foreign key (actor_membership_id, expedition_id)
    references ilka.expedition_members(id, expedition_id)
    on delete restrict,
  constraint event_log_actor_participant_expedition_fk
    foreign key (actor_participant_id, expedition_id)
    references ilka.participants(id, expedition_id)
    on delete restrict,
  constraint event_log_event_id_format
    check (event_id ~ '^evt_[A-Za-z0-9_-]+$'),
  constraint event_log_stream_position_positive
    check (stream_position > 0),
  constraint event_log_command_id_format
    check (command_id ~ '^cmd_[A-Za-z0-9_-]+$'),
  constraint event_log_event_type_format
    check (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  constraint event_log_recorded_after_occurred
    check (recorded_at >= occurred_at),
  constraint event_log_actor_role_nonempty
    check (length(btrim(actor_role)) > 0),
  constraint event_log_event_json_object
    check (jsonb_typeof(event_json) = 'object'),
  constraint event_log_correction_not_self
    check (correction_of_event_id is null or correction_of_event_id <> event_id),
  constraint event_log_reducer_version_nonempty
    check (length(btrim(reducer_version)) > 0)
);

create index event_log_expedition_recorded
  on ilka.event_log (expedition_id, recorded_at, event_id);

create index event_log_command
  on ilka.event_log (command_id, stream_position);

create index event_log_correction_target
  on ilka.event_log (correction_of_event_id)
  where correction_of_event_id is not null;

comment on table ilka.stream_heads is 'Current committed event stream position for one Expedition. Ordering is persistence metadata, not part of the canonical event envelope.';
comment on table ilka.command_receipts is 'Immutable authoritative command results keyed globally by canonical command_id and normalized SHA-256 request_hash.';
comment on table ilka.event_log is 'Append-only authoritative Expedition history. Canonical event JSON is preserved alongside ordered persistence metadata.';
comment on column ilka.event_log.expedition_id is 'Internal Expedition UUID. event_json.expedition_id stores the canonical stable expedition_key.';
comment on column ilka.event_log.correction_of_event_id is 'Earlier event corrected or superseded by this new event. The original event remains immutable.';

alter table ilka.stream_heads enable row level security;
alter table ilka.stream_heads force row level security;
alter table ilka.command_receipts enable row level security;
alter table ilka.command_receipts force row level security;
alter table ilka.event_log enable row level security;
alter table ilka.event_log force row level security;

revoke all on table ilka.stream_heads from public, anon, authenticated;
revoke all on table ilka.command_receipts from public, anon, authenticated;
revoke all on table ilka.event_log from public, anon, authenticated;

revoke all on table ilka.stream_heads from service_role;
revoke all on table ilka.command_receipts from service_role;
revoke all on table ilka.event_log from service_role;

grant select on table ilka.stream_heads to service_role;
grant select on table ilka.command_receipts to service_role;
grant select on table ilka.event_log to service_role;

create or replace function private.initialize_stream_head()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into ilka.stream_heads (expedition_id)
  values (new.id)
  on conflict (expedition_id) do nothing;
  return new;
end;
$$;

create or replace function private.reject_immutable_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = tg_table_name || '_is_append_only';
end;
$$;

create or replace function private.check_command_idempotency(
  p_command_id text,
  p_request_hash bytea
)
returns table (
  outcome text,
  receipt_status text,
  stream_position bigint,
  projection_version bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  existing_receipt record;
begin
  if p_command_id is null or p_command_id !~ '^cmd_[A-Za-z0-9_-]+$' then
    raise exception using
      errcode = '22023',
      message = 'invalid_command_id';
  end if;

  if p_request_hash is null or octet_length(p_request_hash) <> 32 then
    raise exception using
      errcode = '22023',
      message = 'invalid_request_hash';
  end if;

  select
    receipt.request_hash,
    receipt.status,
    receipt.stream_position,
    receipt.projection_version
  into existing_receipt
  from ilka.command_receipts as receipt
  where receipt.command_id = p_command_id;

  if not found then
    return query select 'new'::text, null::text, null::bigint, null::bigint;
    return;
  end if;

  if existing_receipt.request_hash = p_request_hash then
    return query select
      'replay'::text,
      existing_receipt.status,
      existing_receipt.stream_position,
      existing_receipt.projection_version;
    return;
  end if;

  raise exception using
    errcode = '23505',
    message = 'idempotency_key_reused_with_different_payload';
end;
$$;

create or replace function private.assert_expected_stream_position(
  p_expedition_id uuid,
  p_expected_stream_position bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_position bigint;
begin
  if p_expected_stream_position is null or p_expected_stream_position < 0 then
    raise exception using
      errcode = '22023',
      message = 'invalid_expected_stream_position';
  end if;

  select head.current_stream_position
  into current_position
  from ilka.stream_heads as head
  where head.expedition_id = p_expedition_id
  for update;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'stream_head_not_found';
  end if;

  if current_position <> p_expected_stream_position then
    raise exception using
      errcode = '40001',
      message = 'stream_position_conflict',
      detail = format(
        'expected_stream_position=%s current_stream_position=%s',
        p_expected_stream_position,
        current_position
      );
  end if;

  return current_position;
end;
$$;

create or replace function private.validate_command_receipt_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_position bigint;
  pinned_release_id uuid;
  distinct_event_count bigint;
begin
  select
    head.current_stream_position,
    expedition.runtime_release_id
  into current_position, pinned_release_id
  from ilka.stream_heads as head
  join ilka.expeditions as expedition
    on expedition.id = head.expedition_id
  where head.expedition_id = new.expedition_id
  for update of head;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'stream_head_not_found';
  end if;

  if new.runtime_release_id <> pinned_release_id then
    raise exception using
      errcode = '23514',
      message = 'receipt_runtime_release_mismatch';
  end if;

  select count(distinct event_id)
  into distinct_event_count
  from unnest(new.event_ids) as event_id;

  if distinct_event_count <> cardinality(new.event_ids) then
    raise exception using
      errcode = '23514',
      message = 'receipt_event_ids_must_be_unique';
  end if;

  if exists (
    select 1
    from unnest(new.event_ids) as event_id
    where event_id !~ '^evt_[A-Za-z0-9_-]+$'
  ) then
    raise exception using
      errcode = '23514',
      message = 'receipt_event_id_format_invalid';
  end if;

  if new.status = 'accepted' then
    if cardinality(new.event_ids) = 0 then
      raise exception using
        errcode = '23514',
        message = 'accepted_receipt_requires_events';
    end if;

    if new.stream_position <> current_position + cardinality(new.event_ids) then
      raise exception using
        errcode = '40001',
        message = 'receipt_stream_position_out_of_sequence',
        detail = format(
          'current_stream_position=%s event_count=%s resulting_stream_position=%s',
          current_position,
          cardinality(new.event_ids),
          new.stream_position
        );
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.validate_and_advance_event_stream()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_position bigint;
  canonical_expedition_key text;
  receipt record;
  event_index integer;
  expected_event_position bigint;
  json_correction text;
  correction_target record;
begin
  select
    head.current_stream_position,
    expedition.expedition_key
  into current_position, canonical_expedition_key
  from ilka.stream_heads as head
  join ilka.expeditions as expedition
    on expedition.id = head.expedition_id
  where head.expedition_id = new.expedition_id
  for update of head;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'stream_head_not_found';
  end if;

  if new.stream_position <> current_position + 1 then
    raise exception using
      errcode = '40001',
      message = 'event_stream_position_out_of_sequence',
      detail = format(
        'current_stream_position=%s attempted_stream_position=%s',
        current_position,
        new.stream_position
      );
  end if;

  select
    command.status,
    command.event_ids,
    command.stream_position,
    command.runtime_release_id,
    command.reducer_version
  into receipt
  from ilka.command_receipts as command
  where command.command_id = new.command_id
    and command.expedition_id = new.expedition_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'event_command_receipt_not_found';
  end if;

  if receipt.status <> 'accepted' then
    raise exception using
      errcode = '23514',
      message = 'event_requires_accepted_receipt';
  end if;

  event_index := array_position(receipt.event_ids, new.event_id);
  if event_index is null then
    raise exception using
      errcode = '23514',
      message = 'event_not_declared_by_receipt';
  end if;

  expected_event_position :=
    receipt.stream_position - cardinality(receipt.event_ids) + event_index;

  if expected_event_position <> new.stream_position then
    raise exception using
      errcode = '23514',
      message = 'event_receipt_position_mismatch';
  end if;

  if new.runtime_release_id <> receipt.runtime_release_id then
    raise exception using
      errcode = '23514',
      message = 'event_runtime_release_mismatch';
  end if;

  if new.reducer_version <> receipt.reducer_version then
    raise exception using
      errcode = '23514',
      message = 'event_reducer_version_mismatch';
  end if;

  if new.event_json ->> 'event_id' is distinct from new.event_id
     or new.event_json ->> 'event_type' is distinct from new.event_type
     or new.event_json ->> 'command_id' is distinct from new.command_id
     or new.event_json ->> 'expedition_id' is distinct from canonical_expedition_key then
    raise exception using
      errcode = '23514',
      message = 'event_json_metadata_mismatch';
  end if;

  json_correction := nullif(new.event_json ->> 'correction_of', '');
  if json_correction is distinct from new.correction_of_event_id then
    raise exception using
      errcode = '23514',
      message = 'event_correction_metadata_mismatch';
  end if;

  if new.correction_of_event_id is not null then
    select target.expedition_id, target.stream_position
    into correction_target
    from ilka.event_log as target
    where target.event_id = new.correction_of_event_id;

    if not found then
      raise exception using
        errcode = '23503',
        message = 'correction_target_not_found';
    end if;

    if correction_target.expedition_id <> new.expedition_id then
      raise exception using
        errcode = '23514',
        message = 'correction_target_cross_expedition';
    end if;

    if correction_target.stream_position >= new.stream_position then
      raise exception using
        errcode = '23514',
        message = 'correction_target_must_precede_event';
    end if;
  end if;

  update ilka.stream_heads
  set current_stream_position = new.stream_position,
      updated_at = now()
  where expedition_id = new.expedition_id;

  return new;
end;
$$;

create or replace function private.validate_command_receipt_event_set()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  persisted_event_ids text[];
  persisted_final_position bigint;
begin
  if new.status <> 'accepted' then
    return null;
  end if;

  select
    coalesce(array_agg(event.event_id order by event.stream_position), array[]::text[]),
    max(event.stream_position)
  into persisted_event_ids, persisted_final_position
  from ilka.event_log as event
  where event.command_id = new.command_id
    and event.expedition_id = new.expedition_id;

  if persisted_event_ids is distinct from new.event_ids
     or persisted_final_position is distinct from new.stream_position then
    raise exception using
      errcode = '23514',
      message = 'accepted_receipt_event_set_incomplete';
  end if;

  return null;
end;
$$;

revoke all on function private.initialize_stream_head() from public, anon, authenticated;
revoke all on function private.reject_immutable_history_mutation() from public, anon, authenticated;
revoke all on function private.check_command_idempotency(text, bytea) from public, anon, authenticated;
revoke all on function private.assert_expected_stream_position(uuid, bigint) from public, anon, authenticated;
revoke all on function private.validate_command_receipt_insert() from public, anon, authenticated;
revoke all on function private.validate_and_advance_event_stream() from public, anon, authenticated;
revoke all on function private.validate_command_receipt_event_set() from public, anon, authenticated;

grant execute on function private.check_command_idempotency(text, bytea) to service_role;
grant execute on function private.assert_expected_stream_position(uuid, bigint) to service_role;

create trigger expeditions_initialize_stream_head
after insert on ilka.expeditions
for each row execute function private.initialize_stream_head();

insert into ilka.stream_heads (expedition_id)
select expedition.id
from ilka.expeditions as expedition
on conflict (expedition_id) do nothing;

create trigger command_receipts_validate_insert
before insert on ilka.command_receipts
for each row execute function private.validate_command_receipt_insert();

create constraint trigger command_receipts_event_set_complete
after insert on ilka.command_receipts
deferrable initially deferred
for each row execute function private.validate_command_receipt_event_set();

create trigger command_receipts_immutable_row
before update or delete on ilka.command_receipts
for each row execute function private.reject_immutable_history_mutation();

create trigger command_receipts_immutable_truncate
before truncate on ilka.command_receipts
for each statement execute function private.reject_immutable_history_mutation();

create trigger event_log_validate_and_advance
before insert on ilka.event_log
for each row execute function private.validate_and_advance_event_stream();

create trigger event_log_immutable_row
before update or delete on ilka.event_log
for each row execute function private.reject_immutable_history_mutation();

create trigger event_log_immutable_truncate
before truncate on ilka.event_log
for each statement execute function private.reject_immutable_history_mutation();

commit;
