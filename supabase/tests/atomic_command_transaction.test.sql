begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.make_atomic_event(
  p_event_id text,
  p_event_type text,
  p_command_id text,
  p_expedition_key text,
  p_actor_id text,
  p_actor_role text,
  p_payload jsonb,
  p_occurred_at timestamptz
)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'event_id', p_event_id,
    'event_type', p_event_type,
    'occurred_at', p_occurred_at,
    'recorded_at', p_occurred_at + interval '1 second',
    'actor_id', p_actor_id,
    'actor_role', p_actor_role,
    'expedition_id', p_expedition_key,
    'command_id', p_command_id,
    'idempotency_key', p_command_id,
    'schema_version', 1,
    'payload', p_payload
  );
$$;

create function pg_temp.make_atomic_request(
  p_expedition_id uuid,
  p_expedition_key text,
  p_command_id text,
  p_command_type text,
  p_payload jsonb,
  p_request_hash text,
  p_expected_stream_position bigint,
  p_actor_auth_user_id uuid,
  p_actor_profile_id uuid,
  p_actor_membership_id uuid,
  p_actor_participant_id uuid,
  p_actor_id text,
  p_actor_role text,
  p_status text,
  p_events jsonb,
  p_projection_mutations jsonb,
  p_rejection jsonb,
  p_received_at timestamptz
)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'expedition_id', p_expedition_id,
    'command', jsonb_build_object(
      'command_id', p_command_id,
      'command_type', p_command_type,
      'issued_at', p_received_at,
      'actor_id', p_actor_id,
      'actor_role', p_actor_role,
      'expedition_id', p_expedition_key,
      'idempotency_key', p_command_id,
      'payload', p_payload
    ),
    'actor_context', jsonb_build_object(
      'auth_user_id', p_actor_auth_user_id,
      'profile_id', p_actor_profile_id,
      'membership_id', p_actor_membership_id,
      'participant_id', p_actor_participant_id,
      'actor_id', p_actor_id,
      'actor_role', p_actor_role
    ),
    'request_hash', p_request_hash,
    'expected_stream_position', p_expected_stream_position,
    'status', p_status,
    'events', p_events,
    'projection_mutations', p_projection_mutations,
    'runtime_release_id', '22000000-0000-0000-0000-000000000001',
    'reducer_version', 'reducer-atomic-test',
    'received_at', p_received_at,
    'processed_at', p_received_at + interval '2 seconds',
    'rejection', p_rejection
  );
$$;

create temporary table atomic_results (
  result_key text primary key,
  result jsonb not null
);

select has_table('ilka', 'projection_heads', 'projection head table exists');
select has_table('ilka', 'projection_documents', 'projection document table exists');
select has_pk('ilka', 'projection_heads', 'projection_heads has a primary key');
select has_pk('ilka', 'projection_documents', 'projection_documents has a primary key');
select has_column('ilka', 'projection_heads', 'current_projection_version', 'projection head stores the Expedition projection version');
select has_column('ilka', 'projection_documents', 'projection_key', 'projection document has a stable key');
select has_column('ilka', 'projection_documents', 'projection_json', 'projection document stores complete JSON');
select has_column('ilka', 'projection_documents', 'source_stream_position', 'projection records its source stream position');
select has_function('private', 'process_command', array['jsonb'], 'private.process_command(jsonb) exists');
select has_trigger('ilka', 'expeditions', 'expeditions_initialize_projection_head', 'new Expeditions initialize projection heads');

select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class
   where oid = 'ilka.projection_heads'::regclass),
  'projection_heads uses forced RLS'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class
   where oid = 'ilka.projection_documents'::regclass),
  'projection_documents uses forced RLS'
);

select ok(not has_table_privilege('anon', 'ilka.projection_documents', 'SELECT'), 'anon cannot read internal projections');
select ok(not has_table_privilege('authenticated', 'ilka.projection_documents', 'SELECT'), 'authenticated cannot read internal projections');
select ok(has_table_privilege('service_role', 'ilka.projection_documents', 'SELECT'), 'service_role can read internal projections');
select ok(not has_table_privilege('service_role', 'ilka.projection_documents', 'INSERT'), 'service_role cannot directly insert projections');
select ok(not has_table_privilege('service_role', 'ilka.projection_documents', 'UPDATE'), 'service_role cannot directly update projections');
select ok(not has_table_privilege('service_role', 'ilka.projection_documents', 'DELETE'), 'service_role cannot directly delete projections');
select ok(has_function_privilege('service_role', 'private.process_command(jsonb)', 'EXECUTE'), 'service_role can execute the atomic transaction');
select ok(not has_function_privilege('authenticated', 'private.process_command(jsonb)', 'EXECUTE'), 'authenticated cannot execute the atomic transaction');
select ok(not has_function_privilege('anon', 'private.process_command(jsonb)', 'EXECUTE'), 'anon cannot execute the atomic transaction');
select ok(not has_function_privilege('service_role', 'private.build_persisted_command_result(text,boolean,bigint,jsonb)', 'EXECUTE'), 'service_role cannot call the internal receipt serializer directly');

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
      '22000000-0000-0000-0000-000000000001',
      'atomic_command_test',
      '0000000000000000000000000000000000000013',
      'rules-atomic-test',
      'content-atomic-test',
      'reducer-atomic-test'
    )
  $$,
  'atomic transaction fixtures can pin a runtime release'
);

select lives_ok(
  $$
    insert into auth.users (id, aud, role, email, created_at, updated_at)
    values
      ('12000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'atomic-a@example.test', now(), now()),
      ('12000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'atomic-b@example.test', now(), now())
  $$,
  'Auth identities can be created for atomic transaction fixtures'
);

select lives_ok(
  $$
    insert into ilka.expeditions (
      id,
      expedition_key,
      name,
      timezone,
      runtime_release_id,
      created_by_profile_id
    )
    select
      '32000000-0000-0000-0000-000000000001',
      'atomic_test_a',
      'Atomic Test A',
      'Europe/Athens',
      '22000000-0000-0000-0000-000000000001',
      profile.id
    from ilka.profiles as profile
    where profile.auth_user_id = '12000000-0000-0000-0000-000000000001';

    insert into ilka.expeditions (
      id,
      expedition_key,
      name,
      timezone,
      runtime_release_id,
      created_by_profile_id
    )
    select
      '32000000-0000-0000-0000-000000000002',
      'atomic_test_b',
      'Atomic Test B',
      'Europe/Warsaw',
      '22000000-0000-0000-0000-000000000001',
      profile.id
    from ilka.profiles as profile
    where profile.auth_user_id = '12000000-0000-0000-0000-000000000002'
  $$,
  'two isolated Expeditions can be created for transaction tests'
);

select lives_ok(
  $$
    insert into ilka.expedition_members (id, expedition_id, profile_id, role)
    select
      '42000000-0000-0000-0000-000000000001',
      '32000000-0000-0000-0000-000000000001',
      profile.id,
      'participant'
    from ilka.profiles as profile
    where profile.auth_user_id = '12000000-0000-0000-0000-000000000001';

    insert into ilka.expedition_members (id, expedition_id, profile_id, role)
    select
      '42000000-0000-0000-0000-000000000002',
      '32000000-0000-0000-0000-000000000002',
      profile.id,
      'participant'
    from ilka.profiles as profile
    where profile.auth_user_id = '12000000-0000-0000-0000-000000000002';

    insert into ilka.participants (
      id,
      participant_key,
      expedition_id,
      expedition_member_id,
      display_name,
      participant_order
    ) values
      (
        '52000000-0000-0000-0000-000000000001',
        'participant_atomic_a',
        '32000000-0000-0000-0000-000000000001',
        '42000000-0000-0000-0000-000000000001',
        'Atomic Participant A',
        1
      ),
      (
        '52000000-0000-0000-0000-000000000002',
        'participant_atomic_b',
        '32000000-0000-0000-0000-000000000002',
        '42000000-0000-0000-0000-000000000002',
        'Atomic Participant B',
        1
      )
  $$,
  'active Participant actor contexts can be created'
);

select results_eq(
  $$
    select expedition_id, current_stream_position
    from ilka.stream_heads
    where expedition_id in (
      '32000000-0000-0000-0000-000000000001',
      '32000000-0000-0000-0000-000000000002'
    )
    order by expedition_id
  $$,
  $$
    values
      ('32000000-0000-0000-0000-000000000001'::uuid, 0::bigint),
      ('32000000-0000-0000-0000-000000000002'::uuid, 0::bigint)
  $$,
  'every Expedition starts with event stream position zero'
);

select results_eq(
  $$
    select expedition_id, current_projection_version
    from ilka.projection_heads
    where expedition_id in (
      '32000000-0000-0000-0000-000000000001',
      '32000000-0000-0000-0000-000000000002'
    )
    order by expedition_id
  $$,
  $$
    values
      ('32000000-0000-0000-0000-000000000001'::uuid, 0::bigint),
      ('32000000-0000-0000-0000-000000000002'::uuid, 0::bigint)
  $$,
  'every Expedition starts with projection version zero'
);

insert into atomic_results (result_key, result)
select
  'accepted_first',
  private.process_command(
    pg_temp.make_atomic_request(
      '32000000-0000-0000-0000-000000000001',
      'atomic_test_a',
      'cmd_atomic_01',
      'complete_task',
      jsonb_build_object('task_id', 'task_atomic_01'),
      repeat('11', 32),
      0,
      '12000000-0000-0000-0000-000000000001',
      profile.id,
      '42000000-0000-0000-0000-000000000001',
      '52000000-0000-0000-0000-000000000001',
      'participant_atomic_a',
      'participant',
      'accepted',
      jsonb_build_array(
        pg_temp.make_atomic_event(
          'evt_atomic_01',
          'task.completed',
          'cmd_atomic_01',
          'atomic_test_a',
          'participant_atomic_a',
          'participant',
          jsonb_build_object('task_id', 'task_atomic_01'),
          '2026-07-20T19:00:00Z'
        )
      ),
      jsonb_build_array(
        jsonb_build_object(
          'operation', 'upsert',
          'projection_key', 'task_status:task_atomic_01',
          'projection_type', 'task_status',
          'subject_id', 'task_atomic_01',
          'schema_id', 'ilka://projection/task-status',
          'schema_version', '1',
          'projection', jsonb_build_object(
            'expedition_id', 'atomic_test_a',
            'task_id', 'task_atomic_01',
            'status', 'completed'
          )
        ),
        jsonb_build_object(
          'operation', 'upsert',
          'projection_key', 'sync_status:participant_atomic_a',
          'projection_type', 'sync_status',
          'subject_id', 'participant_atomic_a',
          'schema_id', 'ilka://projection/sync-status',
          'schema_version', '1',
          'projection', jsonb_build_object(
            'expedition_id', 'atomic_test_a',
            'participant_id', 'participant_atomic_a',
            'sync_status', 'synced'
          )
        )
      ),
      null,
      '2026-07-20T19:00:00Z'
    )
  )
from ilka.profiles as profile
where profile.auth_user_id = '12000000-0000-0000-0000-000000000001';

set constraints all immediate;
set constraints all deferred;

select results_eq(
  $$select result ->> 'outcome' from atomic_results where result_key = 'accepted_first'$$,
  array['accepted'::text],
  'new prepared command returns accepted'
);
select results_eq(
  $$select (result ->> 'persisted')::boolean from atomic_results where result_key = 'accepted_first'$$,
  array[true],
  'accepted result is persisted'
);
select results_eq(
  $$select (result ->> 'replayed')::boolean from atomic_results where result_key = 'accepted_first'$$,
  array[false],
  'first accepted result is not a replay'
);
select results_eq(
  $$select (result -> 'receipt' ->> 'stream_position')::bigint from atomic_results where result_key = 'accepted_first'$$,
  array[1::bigint],
  'accepted receipt returns final stream position'
);
select results_eq(
  $$select (result -> 'receipt' ->> 'projection_version')::bigint from atomic_results where result_key = 'accepted_first'$$,
  array[1::bigint],
  'accepted receipt returns one Expedition projection version'
);
select results_eq(
  $$select jsonb_array_length(result -> 'projection_updates') from atomic_results where result_key = 'accepted_first'$$,
  array[2],
  'accepted result reports every written projection key'
);

select results_eq(
  $$select command_id, status, stream_position, projection_version from ilka.command_receipts where command_id = 'cmd_atomic_01'$$,
  $$values ('cmd_atomic_01'::text, 'accepted'::text, 1::bigint, 1::bigint)$$,
  'accepted receipt is stored once with final versions'
);
select results_eq(
  $$select event_id, stream_position from ilka.event_log where command_id = 'cmd_atomic_01' order by stream_position$$,
  $$values ('evt_atomic_01'::text, 1::bigint)$$,
  'canonical event is appended at the first consecutive position'
);
select results_eq(
  $$select current_stream_position from ilka.stream_heads where expedition_id = '32000000-0000-0000-0000-000000000001'$$,
  array[1::bigint],
  'accepted event advances the event stream head'
);
select results_eq(
  $$select current_projection_version from ilka.projection_heads where expedition_id = '32000000-0000-0000-0000-000000000001'$$,
  array[1::bigint],
  'accepted projection writes advance the projection head once'
);
select results_eq(
  $$
    select projection_key, projection_version, source_stream_position
    from ilka.projection_documents
    where expedition_id = '32000000-0000-0000-0000-000000000001'
    order by projection_key
  $$,
  $$
    values
      ('sync_status:participant_atomic_a'::text, 1::bigint, 1::bigint),
      ('task_status:task_atomic_01'::text, 1::bigint, 1::bigint)
  $$,
  'all documents from one command share projection and stream versions'
);

insert into atomic_results (result_key, result)
select
  'accepted_second',
  private.process_command(
    pg_temp.make_atomic_request(
      '32000000-0000-0000-0000-000000000001',
      'atomic_test_a',
      'cmd_atomic_02',
      'complete_task',
      jsonb_build_object('task_id', 'task_atomic_02'),
      repeat('22', 32),
      1,
      '12000000-0000-0000-0000-000000000001',
      profile.id,
      '42000000-0000-0000-0000-000000000001',
      '52000000-0000-0000-0000-000000000001',
      'participant_atomic_a',
      'participant',
      'accepted',
      jsonb_build_array(
        pg_temp.make_atomic_event(
          'evt_atomic_02',
          'task.completed',
          'cmd_atomic_02',
          'atomic_test_a',
          'participant_atomic_a',
          'participant',
          jsonb_build_object('task_id', 'task_atomic_02'),
          '2026-07-20T19:01:00Z'
        )
      ),
      jsonb_build_array(
        jsonb_build_object(
          'operation', 'upsert',
          'projection_key', 'task_status:task_atomic_01',
          'projection_type', 'task_status',
          'subject_id', 'task_atomic_01',
          'schema_id', 'ilka://projection/task-status',
          'schema_version', '1',
          'projection', jsonb_build_object(
            'expedition_id', 'atomic_test_a',
            'task_id', 'task_atomic_01',
            'status', 'verified'
          )
        )
      ),
      null,
      '2026-07-20T19:01:00Z'
    )
  )
from ilka.profiles as profile
where profile.auth_user_id = '12000000-0000-0000-0000-000000000001';

set constraints all immediate;
set constraints all deferred;

select results_eq(
  $$select current_stream_position from ilka.stream_heads where expedition_id = '32000000-0000-0000-0000-000000000001'$$,
  array[2::bigint],
  'second accepted command advances the event stream to two'
);
select results_eq(
  $$select current_projection_version from ilka.projection_heads where expedition_id = '32000000-0000-0000-0000-000000000001'$$,
  array[2::bigint],
  'second projection-writing command advances projection version once'
);
select results_eq(
  $$
    select projection_json ->> 'status', projection_version, source_stream_position
    from ilka.projection_documents
    where expedition_id = '32000000-0000-0000-0000-000000000001'
      and projection_key = 'task_status:task_atomic_01'
  $$,
  $$values ('verified'::text, 2::bigint, 2::bigint)$$,
  'stable projection identity receives a complete versioned replacement'
);
select results_eq(
  $$
    select projection_version, source_stream_position
    from ilka.projection_documents
    where expedition_id = '32000000-0000-0000-0000-000000000001'
      and projection_key = 'sync_status:participant_atomic_a'
  $$,
  $$values (1::bigint, 1::bigint)$$,
  'unwritten projection document keeps its prior version'
);

insert into atomic_results (result_key, result)
select
  'replay_first',
  private.process_command(
    pg_temp.make_atomic_request(
      '32000000-0000-0000-0000-000000000001',
      'atomic_test_a',
      'cmd_atomic_01',
      'complete_task',
      jsonb_build_object('task_id', 'task_atomic_01'),
      repeat('11', 32),
      0,
      '12000000-0000-0000-0000-000000000001',
      profile.id,
      '42000000-0000-0000-0000-000000000001',
      '52000000-0000-0000-0000-000000000001',
      'participant_atomic_a',
      'participant',
      'accepted',
      jsonb_build_array(
        pg_temp.make_atomic_event(
          'evt_atomic_01',
          'task.completed',
          'cmd_atomic_01',
          'atomic_test_a',
          'participant_atomic_a',
          'participant',
          jsonb_build_object('task_id', 'task_atomic_01'),
          '2026-07-20T19:00:00Z'
        )
      ),
      '[]'::jsonb,
      null,
      '2026-07-20T19:00:00Z'
    )
  )
from ilka.profiles as profile
where profile.auth_user_id = '12000000-0000-0000-0000-000000000001';

select results_eq(
  $$select (result ->> 'replayed')::boolean, (result -> 'receipt' ->> 'stream_position')::bigint, (result -> 'receipt' ->> 'projection_version')::bigint from atomic_results where result_key = 'replay_first'$$,
  $$values (true, 1::bigint, 1::bigint)$$,
  'exact retry returns the original receipt and original versions'
);
select results_eq(
  $$select count(*) from ilka.command_receipts where command_id = 'cmd_atomic_01'$$,
  array[1::bigint],
  'exact retry does not duplicate the receipt'
);
select results_eq(
  $$select count(*) from ilka.event_log where command_id = 'cmd_atomic_01'$$,
  array[1::bigint],
  'exact retry does not duplicate events'
);
select results_eq(
  $$select current_stream_position, (select current_projection_version from ilka.projection_heads where expedition_id = head.expedition_id) from ilka.stream_heads as head where expedition_id = '32000000-0000-0000-0000-000000000001'$$,
  $$values (2::bigint, 2::bigint)$$,
  'exact retry does not advance current stream or projection heads'
);

insert into atomic_results (result_key, result)
select
  'idempotency_mismatch',
  private.process_command(
    pg_temp.make_atomic_request(
      '32000000-0000-0000-0000-000000000001',
      'atomic_test_a',
      'cmd_atomic_01',
      'complete_task',
      jsonb_build_object('task_id', 'different_task'),
      repeat('33', 32),
      2,
      '12000000-0000-0000-0000-000000000001',
      profile.id,
      '42000000-0000-0000-0000-000000000001',
      '52000000-0000-0000-0000-000000000001',
      'participant_atomic_a',
      'participant',
      'accepted',
      jsonb_build_array(
        pg_temp.make_atomic_event(
          'evt_atomic_mismatch',
          'task.completed',
          'cmd_atomic_01',
          'atomic_test_a',
          'participant_atomic_a',
          'participant',
          jsonb_build_object('task_id', 'different_task'),
          '2026-07-20T19:02:00Z'
        )
      ),
      '[]'::jsonb,
      null,
      '2026-07-20T19:02:00Z'
    )
  )
from ilka.profiles as profile
where profile.auth_user_id = '12000000-0000-0000-0000-000000000001';

select results_eq(
  $$select result ->> 'outcome', (result ->> 'persisted')::boolean, result -> 'receipt' ->> 'rejection_code' from atomic_results where result_key = 'idempotency_mismatch'$$,
  $$values ('rejected'::text, false, 'idempotency_key_reused_with_different_payload'::text)$$,
  'same command_id with another request hash returns an unpersisted rejection'
);
select results_eq(
  $$select count(*) from ilka.event_log where event_id = 'evt_atomic_mismatch'$$,
  array[0::bigint],
  'idempotency mismatch writes no event'
);

insert into atomic_results (result_key, result)
select
  'stale_conflict',
  private.process_command(
    pg_temp.make_atomic_request(
      '32000000-0000-0000-0000-000000000001',
      'atomic_test_a',
      'cmd_atomic_conflict',
      'complete_task',
      jsonb_build_object('task_id', 'task_atomic_conflict'),
      repeat('44', 32),
      0,
      '12000000-0000-0000-0000-000000000001',
      profile.id,
      '42000000-0000-0000-0000-000000000001',
      '52000000-0000-0000-0000-000000000001',
      'participant_atomic_a',
      'participant',
      'accepted',
      jsonb_build_array(
        pg_temp.make_atomic_event(
          'evt_atomic_conflict',
          'task.completed',
          'cmd_atomic_conflict',
          'atomic_test_a',
          'participant_atomic_a',
          'participant',
          jsonb_build_object('task_id', 'task_atomic_conflict'),
          '2026-07-20T19:03:00Z'
        )
      ),
      '[]'::jsonb,
      null,
      '2026-07-20T19:03:00Z'
    )
  )
from ilka.profiles as profile
where profile.auth_user_id = '12000000-0000-0000-0000-000000000001';

select results_eq(
  $$select result ->> 'outcome', result -> 'receipt' ->> 'conflict_code', (result ->> 'persisted')::boolean, (result ->> 'current_stream_position')::bigint from atomic_results where result_key = 'stale_conflict'$$,
  $$values ('conflict'::text, 'stream_position_conflict'::text, false, 2::bigint)$$,
  'stale expected stream position returns authoritative conflict without persistence'
);
select results_eq(
  $$select count(*) from ilka.command_receipts where command_id = 'cmd_atomic_conflict'$$,
  array[0::bigint],
  'stale conflict does not persist a command receipt'
);
select results_eq(
  $$select count(*) from ilka.event_log where event_id = 'evt_atomic_conflict'$$,
  array[0::bigint],
  'stale conflict does not append an event'
);

insert into atomic_results (result_key, result)
select
  'persisted_rejection',
  private.process_command(
    pg_temp.make_atomic_request(
      '32000000-0000-0000-0000-000000000001',
      'atomic_test_a',
      'cmd_atomic_rejected',
      'complete_task',
      jsonb_build_object('task_id', 'task_atomic_rejected'),
      repeat('55', 32),
      2,
      '12000000-0000-0000-0000-000000000001',
      profile.id,
      '42000000-0000-0000-0000-000000000001',
      '52000000-0000-0000-0000-000000000001',
      'participant_atomic_a',
      'participant',
      'rejected',
      '[]'::jsonb,
      '[]'::jsonb,
      jsonb_build_object('code', 'task_already_terminal', 'message', 'Task is already terminal.'),
      '2026-07-20T19:04:00Z'
    )
  )
from ilka.profiles as profile
where profile.auth_user_id = '12000000-0000-0000-0000-000000000001';

select results_eq(
  $$select result ->> 'outcome', (result ->> 'persisted')::boolean, result -> 'receipt' ->> 'rejection_code' from atomic_results where result_key = 'persisted_rejection'$$,
  $$values ('rejected'::text, true, 'task_already_terminal'::text)$$,
  'deterministic rejection is stored as an immutable receipt'
);
select results_eq(
  $$select status, stream_position, projection_version, cardinality(event_ids) from ilka.command_receipts where command_id = 'cmd_atomic_rejected'$$,
  $$values ('rejected'::text, 2::bigint, 2::bigint, 0)$$,
  'rejected receipt records current versions and no events'
);
select results_eq(
  $$select current_stream_position, (select current_projection_version from ilka.projection_heads where expedition_id = head.expedition_id) from ilka.stream_heads as head where expedition_id = '32000000-0000-0000-0000-000000000001'$$,
  $$values (2::bigint, 2::bigint)$$,
  'persisted rejection does not advance event or projection versions'
);

insert into atomic_results (result_key, result)
values (
  'system_multi_event',
  private.process_command(
    pg_temp.make_atomic_request(
      '32000000-0000-0000-0000-000000000001',
      'atomic_test_a',
      'cmd_atomic_system',
      'process_day_boundary',
      jsonb_build_object('local_calendar_date', '2026-07-21', 'boundary_at', '2026-07-21T06:00:00Z'),
      repeat('66', 32),
      2,
      null,
      null,
      null,
      null,
      'system_clock',
      'system_clock',
      'accepted',
      jsonb_build_array(
        pg_temp.make_atomic_event(
          'evt_atomic_system_01',
          'day.started',
          'cmd_atomic_system',
          'atomic_test_a',
          'system_clock',
          'system_clock',
          jsonb_build_object(
            'day_number', 1,
            'calendar_date', '2026-07-21',
            'stage_id', 'onboarding',
            'boundary_at', '2026-07-21T06:00:00Z'
          ),
          '2026-07-21T06:00:00Z'
        ),
        pg_temp.make_atomic_event(
          'evt_atomic_system_02',
          'card_bundles.published',
          'cmd_atomic_system',
          'atomic_test_a',
          'system_clock',
          'system_clock',
          jsonb_build_object('day_number', 1, 'bundles', jsonb_build_array()),
          '2026-07-21T06:00:02Z'
        )
      ),
      jsonb_build_array(
        jsonb_build_object(
          'operation', 'upsert',
          'projection_key', 'day_state',
          'projection_type', 'day_state',
          'subject_id', null,
          'schema_id', 'ilka://projection/day-state',
          'schema_version', '1',
          'projection', jsonb_build_object(
            'expedition_id', 'atomic_test_a',
            'day_number', 1,
            'status', 'active'
          )
        )
      ),
      null,
      '2026-07-21T06:00:00Z'
    )
  )
);

set constraints all immediate;
set constraints all deferred;

select results_eq(
  $$select event_id, stream_position from ilka.event_log where command_id = 'cmd_atomic_system' order by stream_position$$,
  $$
    values
      ('evt_atomic_system_01'::text, 3::bigint),
      ('evt_atomic_system_02'::text, 4::bigint)
  $$,
  'one command allocates consecutive positions for an ordered event array'
);
select results_eq(
  $$select current_stream_position from ilka.stream_heads where expedition_id = '32000000-0000-0000-0000-000000000001'$$,
  array[4::bigint],
  'multi-event command advances stream head to its final position'
);
select results_eq(
  $$select current_projection_version from ilka.projection_heads where expedition_id = '32000000-0000-0000-0000-000000000001'$$,
  array[3::bigint],
  'multi-event command with projection writes advances projection version once'
);
select results_eq(
  $$select projection_version, source_stream_position from ilka.projection_documents where expedition_id = '32000000-0000-0000-0000-000000000001' and projection_key = 'day_state'$$,
  $$values (3::bigint, 4::bigint)$$,
  'projection document points to the final event position of its command'
);

select throws_like(
  $$
    select private.process_command(
      pg_temp.make_atomic_request(
        '32000000-0000-0000-0000-000000000001',
        'atomic_test_a',
        'cmd_atomic_rollback',
        'complete_task',
        jsonb_build_object('task_id', 'task_atomic_rollback'),
        repeat('77', 32),
        4,
        '12000000-0000-0000-0000-000000000001',
        profile.id,
        '42000000-0000-0000-0000-000000000001',
        '52000000-0000-0000-0000-000000000001',
        'participant_atomic_a',
        'participant',
        'accepted',
        jsonb_build_array(
          pg_temp.make_atomic_event(
            'evt_atomic_rollback',
            'task.completed',
            'cmd_atomic_rollback',
            'atomic_test_a',
            'participant_atomic_a',
            'participant',
            jsonb_build_object('task_id', 'task_atomic_rollback'),
            '2026-07-21T06:01:00Z'
          )
        ),
        jsonb_build_array(
          jsonb_build_object(
            'operation', 'upsert',
            'projection_key', 'task_status:task_atomic_rollback',
            'projection_type', 'task_status',
            'subject_id', 'task_atomic_rollback',
            'schema_id', 'ilka://projection/task-status',
            'schema_version', repeat('x', 81),
            'projection', jsonb_build_object(
              'expedition_id', 'atomic_test_a',
              'task_id', 'task_atomic_rollback',
              'status', 'completed'
            )
          )
        ),
        null,
        '2026-07-21T06:01:00Z'
      )
    )
    from ilka.profiles as profile
    where profile.auth_user_id = '12000000-0000-0000-0000-000000000001'
  $$,
  '%projection_documents_schema_version_nonempty%',
  'projection persistence failure rolls back the complete command transaction'
);

select results_eq(
  $$select count(*) from ilka.command_receipts where command_id = 'cmd_atomic_rollback'$$,
  array[0::bigint],
  'rolled-back command leaves no receipt'
);
select results_eq(
  $$select count(*) from ilka.event_log where event_id = 'evt_atomic_rollback'$$,
  array[0::bigint],
  'rolled-back command leaves no event'
);
select results_eq(
  $$select count(*) from ilka.projection_documents where projection_key = 'task_status:task_atomic_rollback'$$,
  array[0::bigint],
  'rolled-back command leaves no projection document'
);
select results_eq(
  $$select current_stream_position, (select current_projection_version from ilka.projection_heads where expedition_id = head.expedition_id) from ilka.stream_heads as head where expedition_id = '32000000-0000-0000-0000-000000000001'$$,
  $$values (4::bigint, 3::bigint)$$,
  'rolled-back command leaves both heads unchanged'
);

select lives_ok(
  $$
    update ilka.expedition_members
    set status = 'banned',
        banned_at = '2026-07-21T07:00:00Z',
        ban_reason = 'atomic replay test'
    where id = '42000000-0000-0000-0000-000000000001'
  $$,
  'actor membership can be banned after the original command'
);

insert into atomic_results (result_key, result)
select
  'replay_after_ban',
  private.process_command(
    pg_temp.make_atomic_request(
      '32000000-0000-0000-0000-000000000001',
      'atomic_test_a',
      'cmd_atomic_01',
      'complete_task',
      jsonb_build_object('task_id', 'task_atomic_01'),
      repeat('11', 32),
      0,
      '12000000-0000-0000-0000-000000000001',
      profile.id,
      '42000000-0000-0000-0000-000000000001',
      '52000000-0000-0000-0000-000000000001',
      'participant_atomic_a',
      'participant',
      'accepted',
      jsonb_build_array(
        pg_temp.make_atomic_event(
          'evt_atomic_01',
          'task.completed',
          'cmd_atomic_01',
          'atomic_test_a',
          'participant_atomic_a',
          'participant',
          jsonb_build_object('task_id', 'task_atomic_01'),
          '2026-07-20T19:00:00Z'
        )
      ),
      '[]'::jsonb,
      null,
      '2026-07-20T19:00:00Z'
    )
  )
from ilka.profiles as profile
where profile.auth_user_id = '12000000-0000-0000-0000-000000000001';

select results_eq(
  $$select (result ->> 'replayed')::boolean, result ->> 'outcome' from atomic_results where result_key = 'replay_after_ban'$$,
  $$values (true, 'accepted'::text)$$,
  'exact replay returns the original receipt even after current membership is banned'
);

select throws_ok(
  $$
    select private.process_command(
      pg_temp.make_atomic_request(
        '32000000-0000-0000-0000-000000000001',
        'atomic_test_a',
        'cmd_atomic_after_ban',
        'complete_task',
        jsonb_build_object('task_id', 'task_atomic_after_ban'),
        repeat('88', 32),
        4,
        '12000000-0000-0000-0000-000000000001',
        profile.id,
        '42000000-0000-0000-0000-000000000001',
        '52000000-0000-0000-0000-000000000001',
        'participant_atomic_a',
        'participant',
        'accepted',
        jsonb_build_array(
          pg_temp.make_atomic_event(
            'evt_atomic_after_ban',
            'task.completed',
            'cmd_atomic_after_ban',
            'atomic_test_a',
            'participant_atomic_a',
            'participant',
            jsonb_build_object('task_id', 'task_atomic_after_ban'),
            '2026-07-21T07:01:00Z'
          )
        ),
        '[]'::jsonb,
        null,
        '2026-07-21T07:01:00Z'
      )
    )
    from ilka.profiles as profile
    where profile.auth_user_id = '12000000-0000-0000-0000-000000000001'
  $$,
  '42501',
  'actor_context_mismatch',
  'new command from banned membership is rejected before persistence'
);

select results_eq(
  $$select count(*) from ilka.command_receipts where command_id = 'cmd_atomic_after_ban'$$,
  array[0::bigint],
  'actor-context failure leaves no receipt'
);
select results_eq(
  $$select count(*) from ilka.event_log where event_id = 'evt_atomic_after_ban'$$,
  array[0::bigint],
  'actor-context failure leaves no event'
);

select * from finish();
rollback;
