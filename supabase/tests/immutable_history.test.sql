begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select has_table('ilka', 'stream_heads', 'Expedition stream head table exists');
select has_table('ilka', 'command_receipts', 'authoritative command receipt table exists');
select has_table('ilka', 'event_log', 'append-only event log table exists');

select has_pk('ilka', 'stream_heads', 'stream_heads has a primary key');
select has_pk('ilka', 'command_receipts', 'command_receipts has a primary key');
select has_pk('ilka', 'event_log', 'event_log has a primary key');

select has_column('ilka', 'stream_heads', 'current_stream_position', 'stream head stores the latest committed position');
select has_column('ilka', 'command_receipts', 'request_hash', 'command receipt stores normalized request hash');
select has_column('ilka', 'command_receipts', 'event_ids', 'command receipt stores ordered event IDs');
select has_column('ilka', 'event_log', 'stream_position', 'event persistence metadata stores stream position');
select has_column('ilka', 'event_log', 'event_json', 'event log preserves the canonical event envelope');
select has_column('ilka', 'event_log', 'correction_of_event_id', 'correction events reference earlier immutable events');

select has_trigger('ilka', 'expeditions', 'expeditions_initialize_stream_head', 'new Expeditions initialize a stream head');
select has_trigger('ilka', 'command_receipts', 'command_receipts_validate_insert', 'receipt insert validates stream and release metadata');
select has_trigger('ilka', 'command_receipts', 'command_receipts_immutable_row', 'command receipts reject row mutation');
select has_trigger('ilka', 'event_log', 'event_log_validate_and_advance', 'event inserts validate and advance the stream');
select has_trigger('ilka', 'event_log', 'event_log_immutable_row', 'event log rejects row mutation');

select ok(
  (select relrowsecurity and relforcerowsecurity
     from pg_class
    where oid = 'ilka.stream_heads'::regclass),
  'stream_heads uses forced RLS'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
     from pg_class
    where oid = 'ilka.command_receipts'::regclass),
  'command_receipts uses forced RLS'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
     from pg_class
    where oid = 'ilka.event_log'::regclass),
  'event_log uses forced RLS'
);

select ok(not has_table_privilege('anon', 'ilka.event_log', 'SELECT'), 'anon cannot read event history');
select ok(not has_table_privilege('authenticated', 'ilka.event_log', 'SELECT'), 'authenticated cannot read raw event history');
select ok(not has_table_privilege('authenticated', 'ilka.command_receipts', 'SELECT'), 'authenticated cannot read raw command receipts');
select ok(has_table_privilege('service_role', 'ilka.event_log', 'SELECT'), 'service_role can read internal event history');
select ok(not has_table_privilege('service_role', 'ilka.event_log', 'INSERT'), 'service_role cannot directly append events');
select ok(not has_table_privilege('service_role', 'ilka.event_log', 'UPDATE'), 'service_role cannot update events');
select ok(not has_table_privilege('service_role', 'ilka.event_log', 'DELETE'), 'service_role cannot delete events');
select ok(not has_table_privilege('service_role', 'ilka.command_receipts', 'INSERT'), 'service_role cannot directly insert receipts');
select ok(not has_table_privilege('service_role', 'ilka.command_receipts', 'UPDATE'), 'service_role cannot update receipts');
select ok(not has_table_privilege('service_role', 'ilka.command_receipts', 'DELETE'), 'service_role cannot delete receipts');

select ok(
  has_function_privilege('service_role', 'private.check_command_idempotency(text,bytea)', 'EXECUTE'),
  'service_role can check command idempotency through a private helper'
);
select ok(
  not has_function_privilege('authenticated', 'private.check_command_idempotency(text,bytea)', 'EXECUTE'),
  'authenticated cannot call the idempotency helper'
);
select ok(
  has_function_privilege('service_role', 'private.assert_expected_stream_position(uuid,bigint)', 'EXECUTE'),
  'service_role can validate expected stream position through a private helper'
);
select ok(
  not has_function_privilege('authenticated', 'private.assert_expected_stream_position(uuid,bigint)', 'EXECUTE'),
  'authenticated cannot call the stream conflict helper'
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
      '21000000-0000-0000-0000-000000000001',
      'immutable_history_test',
      '0000000000000000000000000000000000000003',
      'rules-history-test',
      'content-history-test',
      'reducer-history-test'
    )
  $$,
  'history fixtures can pin an immutable runtime release'
);

select lives_ok(
  $$
    insert into auth.users (id, aud, role, email, created_at, updated_at)
    values
      ('11000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'history-captain-a@example.test', now(), now()),
      ('11000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'history-captain-b@example.test', now(), now())
  $$,
  'Auth identities can be created for immutable history fixtures'
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
      '31000000-0000-0000-0000-000000000001',
      'history_test_a',
      'History Test A',
      'Europe/Athens',
      '21000000-0000-0000-0000-000000000001',
      profile.id
    from ilka.profiles as profile
    where profile.auth_user_id = '11000000-0000-0000-0000-000000000001';

    insert into ilka.expeditions (
      id,
      expedition_key,
      name,
      timezone,
      runtime_release_id,
      created_by_profile_id
    )
    select
      '31000000-0000-0000-0000-000000000002',
      'history_test_b',
      'History Test B',
      'Europe/Warsaw',
      '21000000-0000-0000-0000-000000000001',
      profile.id
    from ilka.profiles as profile
    where profile.auth_user_id = '11000000-0000-0000-0000-000000000002'
  $$,
  'two isolated history test Expeditions can be created'
);

select results_eq(
  $$
    select expedition_id, current_stream_position
    from ilka.stream_heads
    where expedition_id in (
      '31000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000002'
    )
    order by expedition_id
  $$,
  $$
    values
      ('31000000-0000-0000-0000-000000000001'::uuid, 0::bigint),
      ('31000000-0000-0000-0000-000000000002'::uuid, 0::bigint)
  $$,
  'each Expedition starts with stream position zero'
);

select lives_ok(
  $$
    insert into ilka.expedition_members (id, expedition_id, profile_id, role)
    select
      '41000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000001',
      profile.id,
      'captain'
    from ilka.profiles as profile
    where profile.auth_user_id = '11000000-0000-0000-0000-000000000001';

    insert into ilka.expedition_members (id, expedition_id, profile_id, role)
    select
      '41000000-0000-0000-0000-000000000002',
      '31000000-0000-0000-0000-000000000002',
      profile.id,
      'captain'
    from ilka.profiles as profile
    where profile.auth_user_id = '11000000-0000-0000-0000-000000000002'
  $$,
  'history fixtures have Expedition-scoped Captain memberships'
);

select results_eq(
  $$
    select outcome
    from private.check_command_idempotency(
      'cmd_history_01',
      decode(repeat('11', 32), 'hex')
    )
  $$,
  array['new'::text],
  'unknown command_id is classified as new'
);

select results_eq(
  $$
    select private.assert_expected_stream_position(
      '31000000-0000-0000-0000-000000000001',
      0
    )
  $$,
  array[0::bigint],
  'current stream head accepts the matching expected position'
);

select throws_ok(
  $$
    select private.assert_expected_stream_position(
      '31000000-0000-0000-0000-000000000001',
      1
    )
  $$,
  '40001',
  'stream_position_conflict',
  'stale expected stream position is detected before persistence'
);

select lives_ok(
  $$
    insert into ilka.command_receipts (
      command_id,
      expedition_id,
      command_type,
      actor_auth_user_id,
      actor_profile_id,
      actor_membership_id,
      actor_role,
      request_hash,
      status,
      received_at,
      processed_at,
      event_ids,
      stream_position,
      runtime_release_id,
      reducer_version
    )
    select
      'cmd_history_01',
      '31000000-0000-0000-0000-000000000001',
      'complete_task',
      '11000000-0000-0000-0000-000000000001',
      profile.id,
      '41000000-0000-0000-0000-000000000001',
      'captain',
      decode(repeat('11', 32), 'hex'),
      'accepted',
      '2026-07-20T17:00:00Z'::timestamptz,
      '2026-07-20T17:00:01Z'::timestamptz,
      array['evt_history_01', 'evt_history_02'],
      2,
      '21000000-0000-0000-0000-000000000001',
      'reducer-history-test'
    from ilka.profiles as profile
    where profile.auth_user_id = '11000000-0000-0000-0000-000000000001'
  $$,
  'accepted receipt declares the ordered event set and resulting stream position'
);

select lives_ok(
  $$
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
      actor_role,
      causation_id,
      correlation_id,
      event_json,
      runtime_release_id,
      reducer_version
    )
    select
      'evt_history_01',
      '31000000-0000-0000-0000-000000000001',
      1,
      'cmd_history_01',
      'task.completed',
      '2026-07-20T17:00:00Z'::timestamptz,
      '2026-07-20T17:00:01Z'::timestamptz,
      '11000000-0000-0000-0000-000000000001',
      profile.id,
      '41000000-0000-0000-0000-000000000001',
      'captain',
      'cmd_history_01',
      'cmd_history_01',
      jsonb_build_object(
        'event_id', 'evt_history_01',
        'event_type', 'task.completed',
        'occurred_at', '2026-07-20T17:00:00Z',
        'recorded_at', '2026-07-20T17:00:01Z',
        'actor_id', 'captain_history_a',
        'actor_role', 'captain',
        'expedition_id', 'history_test_a',
        'command_id', 'cmd_history_01',
        'idempotency_key', 'history-01',
        'schema_version', 1,
        'payload', jsonb_build_object('task_id', 'task_01')
      ),
      '21000000-0000-0000-0000-000000000001',
      'reducer-history-test'
    from ilka.profiles as profile
    where profile.auth_user_id = '11000000-0000-0000-0000-000000000001';

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
      actor_role,
      causation_id,
      correlation_id,
      event_json,
      correction_of_event_id,
      runtime_release_id,
      reducer_version
    )
    select
      'evt_history_02',
      '31000000-0000-0000-0000-000000000001',
      2,
      'cmd_history_01',
      'task.waived',
      '2026-07-20T17:00:02Z'::timestamptz,
      '2026-07-20T17:00:03Z'::timestamptz,
      '11000000-0000-0000-0000-000000000001',
      profile.id,
      '41000000-0000-0000-0000-000000000001',
      'captain',
      'evt_history_01',
      'cmd_history_01',
      jsonb_build_object(
        'event_id', 'evt_history_02',
        'event_type', 'task.waived',
        'occurred_at', '2026-07-20T17:00:02Z',
        'recorded_at', '2026-07-20T17:00:03Z',
        'actor_id', 'captain_history_a',
        'actor_role', 'captain',
        'expedition_id', 'history_test_a',
        'command_id', 'cmd_history_01',
        'idempotency_key', 'history-01',
        'schema_version', 1,
        'correction_of', 'evt_history_01',
        'payload', jsonb_build_object('task_id', 'task_01', 'reason', 'correction test')
      ),
      'evt_history_01',
      '21000000-0000-0000-0000-000000000001',
      'reducer-history-test'
    from ilka.profiles as profile
    where profile.auth_user_id = '11000000-0000-0000-0000-000000000001'
  $$,
  'ordered canonical events and a correcting event append successfully'
);

set constraints command_receipts_event_set_complete immediate;
set constraints command_receipts_event_set_complete deferred;

select results_eq(
  $$
    select event_id
    from ilka.event_log
    where expedition_id = '31000000-0000-0000-0000-000000000001'
    order by stream_position
  $$,
  $$values ('evt_history_01'::text), ('evt_history_02'::text)$$,
  'runtime replay order is the committed stream_position order'
);

select results_eq(
  $$
    select current_stream_position
    from ilka.stream_heads
    where expedition_id = '31000000-0000-0000-0000-000000000001'
  $$,
  array[2::bigint],
  'event append advances the Expedition stream head without gaps'
);

select results_eq(
  $$
    select event_json -> 'payload' ->> 'task_id'
    from ilka.event_log
    where event_id = 'evt_history_01'
  $$,
  array['task_01'::text],
  'correcting event preserves the original event unchanged'
);

select results_eq(
  $$
    select correction_of_event_id
    from ilka.event_log
    where event_id = 'evt_history_02'
  $$,
  array['evt_history_01'::text],
  'correcting event points to an earlier event in the same Expedition'
);

select results_eq(
  $$
    select outcome
    from private.check_command_idempotency(
      'cmd_history_01',
      decode(repeat('11', 32), 'hex')
    )
  $$,
  array['replay'::text],
  'same command_id and request_hash resolves to replay'
);

select throws_ok(
  $$
    select *
    from private.check_command_idempotency(
      'cmd_history_01',
      decode(repeat('22', 32), 'hex')
    )
  $$,
  '23505',
  'idempotency_key_reused_with_different_payload',
  'same command_id with a different request_hash is rejected'
);

select throws_ok(
  $$
    insert into ilka.command_receipts (
      command_id,
      expedition_id,
      command_type,
      actor_role,
      request_hash,
      status,
      received_at,
      processed_at,
      event_ids,
      stream_position,
      runtime_release_id,
      reducer_version
    ) values (
      'cmd_history_gap',
      '31000000-0000-0000-0000-000000000001',
      'complete_task',
      'system',
      decode(repeat('33', 32), 'hex'),
      'accepted',
      '2026-07-20T17:01:00Z',
      '2026-07-20T17:01:01Z',
      array['evt_history_gap'],
      4,
      '21000000-0000-0000-0000-000000000001',
      'reducer-history-test'
    )
  $$,
  '40001',
  'receipt_stream_position_out_of_sequence',
  'accepted receipt cannot reserve a non-consecutive stream position'
);

select throws_ok(
  $$
    insert into ilka.command_receipts (
      command_id,
      expedition_id,
      command_type,
      actor_role,
      request_hash,
      status,
      received_at,
      processed_at,
      event_ids,
      stream_position,
      runtime_release_id,
      reducer_version
    ) values (
      'cmd_history_duplicate_events',
      '31000000-0000-0000-0000-000000000001',
      'complete_task',
      'system',
      decode(repeat('44', 32), 'hex'),
      'accepted',
      '2026-07-20T17:02:00Z',
      '2026-07-20T17:02:01Z',
      array['evt_history_dup', 'evt_history_dup'],
      4,
      '21000000-0000-0000-0000-000000000001',
      'reducer-history-test'
    )
  $$,
  '23514',
  'receipt_event_ids_must_be_unique',
  'receipt cannot declare duplicate event IDs'
);

select throws_ok(
  $$update ilka.event_log set event_type = 'task.blocked' where event_id = 'evt_history_01'$$,
  '55000',
  'event_log_is_append_only',
  'events cannot be updated'
);

select throws_ok(
  $$delete from ilka.event_log where event_id = 'evt_history_01'$$,
  '55000',
  'event_log_is_append_only',
  'events cannot be deleted'
);

select throws_ok(
  $$truncate table ilka.event_log$$,
  '55000',
  'event_log_is_append_only',
  'event history cannot be truncated'
);

select throws_ok(
  $$update ilka.command_receipts set command_type = 'block_task' where command_id = 'cmd_history_01'$$,
  '55000',
  'command_receipts_is_append_only',
  'command receipts cannot be updated'
);

select throws_ok(
  $$delete from ilka.command_receipts where command_id = 'cmd_history_01'$$,
  '55000',
  'command_receipts_is_append_only',
  'command receipts cannot be deleted'
);

select lives_ok(
  $$
    insert into ilka.command_receipts (
      command_id,
      expedition_id,
      command_type,
      actor_role,
      request_hash,
      status,
      received_at,
      processed_at,
      event_ids,
      stream_position,
      runtime_release_id,
      reducer_version
    ) values (
      'cmd_history_cross_correction',
      '31000000-0000-0000-0000-000000000002',
      'complete_task',
      'system',
      decode(repeat('55', 32), 'hex'),
      'accepted',
      '2026-07-20T17:03:00Z',
      '2026-07-20T17:03:01Z',
      array['evt_history_cross_correction'],
      1,
      '21000000-0000-0000-0000-000000000001',
      'reducer-history-test'
    )
  $$,
  'second Expedition can prepare its first accepted receipt'
);

select throws_ok(
  $$
    insert into ilka.event_log (
      event_id,
      expedition_id,
      stream_position,
      command_id,
      event_type,
      occurred_at,
      recorded_at,
      actor_role,
      event_json,
      correction_of_event_id,
      runtime_release_id,
      reducer_version
    ) values (
      'evt_history_cross_correction',
      '31000000-0000-0000-0000-000000000002',
      1,
      'cmd_history_cross_correction',
      'task.waived',
      '2026-07-20T17:03:00Z',
      '2026-07-20T17:03:01Z',
      'system',
      jsonb_build_object(
        'event_id', 'evt_history_cross_correction',
        'event_type', 'task.waived',
        'expedition_id', 'history_test_b',
        'command_id', 'cmd_history_cross_correction',
        'correction_of', 'evt_history_01',
        'payload', jsonb_build_object('task_id', 'task_02', 'reason', 'invalid cross Expedition correction')
      ),
      'evt_history_01',
      '21000000-0000-0000-0000-000000000001',
      'reducer-history-test'
    )
  $$,
  '23514',
  'correction_target_cross_expedition',
  'correction event cannot target an event from another Expedition'
);

select results_eq(
  $$
    select current_stream_position
    from ilka.stream_heads
    where expedition_id = '31000000-0000-0000-0000-000000000002'
  $$,
  array[0::bigint],
  'failed cross-Expedition correction does not advance the stream head'
);

select throws_ok(
  $$
    insert into ilka.command_receipts (
      command_id,
      expedition_id,
      command_type,
      actor_role,
      request_hash,
      status,
      received_at,
      processed_at,
      event_ids,
      stream_position,
      runtime_release_id,
      reducer_version
    ) values (
      'cmd_history_incomplete',
      '31000000-0000-0000-0000-000000000002',
      'complete_task',
      'system',
      decode(repeat('66', 32), 'hex'),
      'accepted',
      '2026-07-20T17:04:00Z',
      '2026-07-20T17:04:01Z',
      array['evt_history_missing'],
      1,
      '21000000-0000-0000-0000-000000000001',
      'reducer-history-test'
    );
    set constraints command_receipts_event_set_complete immediate
  $$,
  '23514',
  'accepted_receipt_event_set_incomplete',
  'accepted receipt cannot commit without its complete ordered event set'
);

select * from finish();
rollback;
