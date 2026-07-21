begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.make_bootstrap_request(
  p_expedition_id uuid,
  p_membership_id uuid,
  p_profile_id uuid,
  p_auth_user_id uuid,
  p_runtime_release_id uuid,
  p_reducer_version text,
  p_expedition_key text,
  p_command_id text,
  p_request_hash text,
  p_timezone text default 'Europe/Warsaw',
  p_processed_before_received boolean default false
)
returns jsonb
language sql
as $$
  with valueset as (
    select
      'member_' || replace(p_membership_id::text, '-', '') as actor_id,
      timestamptz '2026-07-21T10:00:00Z' as received_at
  )
  select jsonb_build_object(
    'expedition', jsonb_build_object(
      'id', p_expedition_id,
      'expedition_key', p_expedition_key,
      'name', 'Bootstrap Transaction Test',
      'timezone', p_timezone,
      'day_boundary_local_time', '06:00',
      'duration_days', 12,
      'recovery_days_available', 1,
      'runtime_release_id', p_runtime_release_id,
      'created_by_profile_id', p_profile_id
    ),
    'captain_membership', jsonb_build_object(
      'id', p_membership_id,
      'profile_id', p_profile_id,
      'role', 'captain',
      'status', 'active'
    ),
    'process_command_request', jsonb_build_object(
      'expedition_id', p_expedition_id,
      'command', jsonb_build_object(
        'command_id', p_command_id,
        'command_type', 'create_expedition',
        'issued_at', valueset.received_at,
        'actor_id', valueset.actor_id,
        'actor_role', 'captain',
        'expedition_id', p_expedition_key,
        'idempotency_key', p_command_id,
        'day_number', null,
        'stage_id', null,
        'day_revision', null,
        'payload', jsonb_build_object(
          'name', 'Bootstrap Transaction Test',
          'timezone', p_timezone,
          'duration_days', 12,
          'day_boundary_local_time', '06:00'
        )
      ),
      'actor_context', jsonb_build_object(
        'auth_user_id', p_auth_user_id,
        'profile_id', p_profile_id,
        'membership_id', p_membership_id,
        'participant_id', null,
        'actor_id', valueset.actor_id,
        'actor_role', 'captain'
      ),
      'request_hash', p_request_hash,
      'expected_stream_position', 0,
      'status', 'accepted',
      'events', jsonb_build_array(jsonb_build_object(
        'event_id', 'evt_' || substring(p_command_id from 5) || '_created',
        'event_type', 'expedition.created',
        'occurred_at', valueset.received_at,
        'recorded_at', valueset.received_at + interval '1 second',
        'actor_id', valueset.actor_id,
        'actor_role', 'captain',
        'expedition_id', p_expedition_key,
        'day_number', null,
        'stage_id', null,
        'day_revision', null,
        'command_id', p_command_id,
        'idempotency_key', p_command_id,
        'schema_version', 1,
        'payload', jsonb_build_object(
          'name', 'Bootstrap Transaction Test',
          'timezone', p_timezone,
          'duration_days', 12,
          'day_boundary_local_time', '06:00'
        )
      )),
      'projection_mutations', jsonb_build_array(),
      'runtime_release_id', p_runtime_release_id,
      'reducer_version', p_reducer_version,
      'received_at', valueset.received_at,
      'processed_at', case
        when p_processed_before_received then valueset.received_at - interval '1 second'
        else valueset.received_at + interval '2 seconds'
      end,
      'rejection', null
    )
  )
  from valueset;
$$;

create temporary table bootstrap_results (
  result_key text primary key,
  result jsonb not null
);

select has_function(
  'private',
  'bootstrap_expedition',
  array['jsonb'],
  'private.bootstrap_expedition(jsonb) exists'
);
select ok(
  has_function_privilege('service_role', 'private.bootstrap_expedition(jsonb)', 'EXECUTE'),
  'service_role can execute Expedition bootstrap'
);
select ok(
  not has_function_privilege('authenticated', 'private.bootstrap_expedition(jsonb)', 'EXECUTE'),
  'authenticated cannot execute private Expedition bootstrap directly'
);
select ok(
  not has_function_privilege('anon', 'private.bootstrap_expedition(jsonb)', 'EXECUTE'),
  'anon cannot execute private Expedition bootstrap directly'
);
select ok(
  (
    select p.prosecdef and p.proconfig @> array['search_path=""']::text[]
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'bootstrap_expedition'
      and pg_get_function_identity_arguments(p.oid) = 'p_request jsonb'
  ),
  'Expedition bootstrap is SECURITY DEFINER with an empty search_path'
);

select lives_ok(
  $$
    insert into ilka.runtime_releases (
      id,
      release_key,
      git_commit_sha,
      rules_release,
      content_release,
      reducer_version
    ) values (
      '82000000-0000-0000-0000-000000000001',
      'bootstrap_transaction_test',
      '0000000000000000000000000000000000000082',
      'rules-bootstrap-transaction-test',
      'content-bootstrap-transaction-test',
      'bootstrap-transaction-v1'
    )
  $$,
  'bootstrap transaction fixtures pin one immutable runtime release'
);

select lives_ok(
  $$
    insert into auth.users (id, aud, role, email, created_at, updated_at)
    values
      ('81000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'bootstrap-a@example.test', now(), now()),
      ('81000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bootstrap-b@example.test', now(), now()),
      ('81000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'bootstrap-disabled@example.test', now(), now())
  $$,
  'Auth identities create bootstrap Profile fixtures'
);

update ilka.profiles
set display_name = 'Bootstrap Captain A'
where auth_user_id = '81000000-0000-0000-0000-000000000001';
update ilka.profiles
set display_name = 'Bootstrap Captain B'
where auth_user_id = '81000000-0000-0000-0000-000000000002';
update ilka.profiles
set status = 'disabled'
where auth_user_id = '81000000-0000-0000-0000-000000000003';

select lives_ok(
  $$
    insert into bootstrap_results (result_key, result)
    select
      'accepted',
      private.bootstrap_expedition(pg_temp.make_bootstrap_request(
        '83000000-0000-0000-0000-000000000001',
        '84000000-0000-0000-0000-000000000001',
        profile.id,
        '81000000-0000-0000-0000-000000000001',
        '82000000-0000-0000-0000-000000000001',
        'bootstrap-transaction-v1',
        'bootstrap_transaction_a',
        'cmd_bootstrap_transaction_a',
        repeat('a', 64)
      ))
    from ilka.profiles as profile
    where profile.auth_user_id = '81000000-0000-0000-0000-000000000001'
  $$,
  'valid bootstrap commits the complete Expedition aggregate atomically'
);

select is(
  (select result ->> 'outcome' from bootstrap_results where result_key = 'accepted'),
  'accepted',
  'valid bootstrap returns accepted'
);
select is(
  (select (result -> 'receipt' ->> 'stream_position')::integer from bootstrap_results where result_key = 'accepted'),
  1,
  'accepted bootstrap advances the new Expedition stream to position 1'
);
select is(
  (select (result -> 'receipt' ->> 'projection_version')::integer from bootstrap_results where result_key = 'accepted'),
  0,
  'accepted bootstrap leaves projection version at 0'
);
select is(
  (select status from ilka.expeditions where expedition_key = 'bootstrap_transaction_a'),
  'draft',
  'bootstrap creates a draft Expedition'
);
select is(
  (select count(*)::integer from ilka.expedition_members where expedition_id = '83000000-0000-0000-0000-000000000001' and role = 'captain' and status = 'active'),
  1,
  'bootstrap creates exactly one active Captain membership'
);
select is(
  (select current_stream_position::integer from ilka.stream_heads where expedition_id = '83000000-0000-0000-0000-000000000001'),
  1,
  'bootstrap stream head records the creation event'
);
select is(
  (select current_projection_version::integer from ilka.projection_heads where expedition_id = '83000000-0000-0000-0000-000000000001'),
  0,
  'bootstrap projection head remains at version 0'
);
select is(
  (select count(*)::integer from ilka.command_receipts where expedition_id = '83000000-0000-0000-0000-000000000001' and command_type = 'create_expedition'),
  1,
  'bootstrap creates one accepted command receipt'
);
select is(
  (select count(*)::integer from ilka.event_log where expedition_id = '83000000-0000-0000-0000-000000000001' and event_type = 'expedition.created' and stream_position = 1),
  1,
  'bootstrap appends one expedition.created event at position 1'
);
select is(
  (select count(*)::integer from ilka.participants where expedition_id = '83000000-0000-0000-0000-000000000001'),
  0,
  'bootstrap creates no Participant rows'
);
select is(
  (select count(*)::integer from ilka.invitations where expedition_id = '83000000-0000-0000-0000-000000000001'),
  0,
  'bootstrap creates no invitations'
);
select is(
  (select count(*)::integer from ilka.projection_documents where expedition_id = '83000000-0000-0000-0000-000000000001'),
  0,
  'bootstrap creates no projection documents'
);

select lives_ok(
  $$
    insert into bootstrap_results (result_key, result)
    select
      'replay',
      private.bootstrap_expedition(pg_temp.make_bootstrap_request(
        '83000000-0000-0000-0000-000000000001',
        '84000000-0000-0000-0000-000000000001',
        profile.id,
        '81000000-0000-0000-0000-000000000001',
        '82000000-0000-0000-0000-000000000001',
        'bootstrap-transaction-v1',
        'bootstrap_transaction_a',
        'cmd_bootstrap_transaction_a',
        repeat('a', 64)
      ))
    from ilka.profiles as profile
    where profile.auth_user_id = '81000000-0000-0000-0000-000000000001'
  $$,
  'exact bootstrap retry returns the persisted result'
);
select ok(
  (select (result ->> 'replayed')::boolean from bootstrap_results where result_key = 'replay'),
  'exact bootstrap retry is marked replayed'
);
select is(
  (select count(*)::integer from ilka.expeditions where expedition_key = 'bootstrap_transaction_a'),
  1,
  'exact replay creates no duplicate Expedition'
);
select is(
  (select count(*)::integer from ilka.event_log where command_id = 'cmd_bootstrap_transaction_a'),
  1,
  'exact replay creates no duplicate event'
);

select throws_ok(
  $$
    select private.bootstrap_expedition(pg_temp.make_bootstrap_request(
      '83000000-0000-0000-0000-000000000001',
      '84000000-0000-0000-0000-000000000001',
      profile.id,
      '81000000-0000-0000-0000-000000000001',
      '82000000-0000-0000-0000-000000000001',
      'bootstrap-transaction-v1',
      'bootstrap_transaction_a',
      'cmd_bootstrap_transaction_a',
      repeat('b', 64)
    ))
    from ilka.profiles as profile
    where profile.auth_user_id = '81000000-0000-0000-0000-000000000001'
  $$,
  '23514',
  'idempotency_key_reused_with_different_payload',
  'same command_id with another request hash is rejected without mutation'
);

select throws_ok(
  $$
    select private.bootstrap_expedition(pg_temp.make_bootstrap_request(
      '83000000-0000-0000-0000-000000000002',
      '84000000-0000-0000-0000-000000000002',
      profile.id,
      '81000000-0000-0000-0000-000000000002',
      '82000000-0000-0000-0000-000000000001',
      'bootstrap-transaction-v1',
      'bootstrap_transaction_a',
      'cmd_bootstrap_duplicate_key',
      repeat('c', 64)
    ))
    from ilka.profiles as profile
    where profile.auth_user_id = '81000000-0000-0000-0000-000000000002'
  $$,
  '23505',
  'expedition_key_already_exists',
  'another command cannot reuse an existing Expedition key'
);
select is(
  (select count(*)::integer from ilka.expeditions where id = '83000000-0000-0000-0000-000000000002'),
  0,
  'Expedition-key collision creates no partial aggregate'
);

select throws_ok(
  $$
    select private.bootstrap_expedition(pg_temp.make_bootstrap_request(
      '83000000-0000-0000-0000-000000000003',
      '84000000-0000-0000-0000-000000000003',
      profile.id,
      '81000000-0000-0000-0000-000000000003',
      '82000000-0000-0000-0000-000000000001',
      'bootstrap-transaction-v1',
      'bootstrap_transaction_disabled',
      'cmd_bootstrap_disabled',
      repeat('d', 64)
    ))
    from ilka.profiles as profile
    where profile.auth_user_id = '81000000-0000-0000-0000-000000000003'
  $$,
  '42501',
  'active_profile_required',
  'disabled Profile cannot bootstrap an Expedition'
);
select is(
  (select count(*)::integer from ilka.expeditions where expedition_key = 'bootstrap_transaction_disabled'),
  0,
  'disabled Profile failure writes no Expedition'
);

select throws_ok(
  $$
    select private.bootstrap_expedition(pg_temp.make_bootstrap_request(
      '83000000-0000-0000-0000-000000000004',
      '84000000-0000-0000-0000-000000000004',
      profile.id,
      '81000000-0000-0000-0000-000000000002',
      '82000000-0000-0000-0000-000000000001',
      'bootstrap-transaction-v1',
      'bootstrap_transaction_timezone',
      'cmd_bootstrap_timezone',
      repeat('e', 64),
      'Mars/Olympus'
    ))
    from ilka.profiles as profile
    where profile.auth_user_id = '81000000-0000-0000-0000-000000000002'
  $$,
  '22023',
  'invalid_timezone',
  'invalid IANA timezone is rejected before aggregate creation'
);

select throws_ok(
  $$
    select private.bootstrap_expedition(pg_temp.make_bootstrap_request(
      '83000000-0000-0000-0000-000000000005',
      '84000000-0000-0000-0000-000000000005',
      profile.id,
      '81000000-0000-0000-0000-000000000002',
      '82000000-0000-0000-0000-000000000099',
      'missing-runtime-v1',
      'bootstrap_transaction_runtime',
      'cmd_bootstrap_runtime',
      repeat('f', 64)
    ))
    from ilka.profiles as profile
    where profile.auth_user_id = '81000000-0000-0000-0000-000000000002'
  $$,
  '23503',
  'runtime_release_unavailable',
  'missing immutable runtime release is rejected'
);

select throws_ok(
  $$
    select private.bootstrap_expedition(pg_temp.make_bootstrap_request(
      '83000000-0000-0000-0000-000000000006',
      '84000000-0000-0000-0000-000000000006',
      profile.id,
      '81000000-0000-0000-0000-000000000002',
      '82000000-0000-0000-0000-000000000001',
      'bootstrap-transaction-v1',
      'bootstrap_transaction_rollback',
      'cmd_bootstrap_rollback',
      repeat('1', 64),
      'Europe/Warsaw',
      true
    ))
    from ilka.profiles as profile
    where profile.auth_user_id = '81000000-0000-0000-0000-000000000002'
  $$,
  '22023',
  'invalid_processing_timestamps',
  'failure inside private.process_command rolls back aggregate creation'
);
select is(
  (select count(*)::integer from ilka.expeditions where expedition_key = 'bootstrap_transaction_rollback'),
  0,
  'process-command failure rolls back the Expedition row'
);
select is(
  (select count(*)::integer from ilka.expedition_members where id = '84000000-0000-0000-0000-000000000006'),
  0,
  'process-command failure rolls back the Captain membership'
);
select is(
  (select count(*)::integer from ilka.stream_heads where expedition_id = '83000000-0000-0000-0000-000000000006'),
  0,
  'process-command failure rolls back the stream head'
);
select is(
  (select count(*)::integer from ilka.projection_heads where expedition_id = '83000000-0000-0000-0000-000000000006'),
  0,
  'process-command failure rolls back the projection head'
);

select * from finish();
rollback;
