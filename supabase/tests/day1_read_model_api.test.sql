begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select has_function('api', 'get_today_view', array['text'], 'api.get_today_view(text) exists');
select has_function('api', 'get_captain_day_view', array['text'], 'api.get_captain_day_view(text) exists');
select has_function('api', 'get_command_receipt', array['text'], 'api.get_command_receipt(text) exists');

select ok(
  has_function_privilege('authenticated', 'api.get_today_view(text)', 'EXECUTE'),
  'authenticated can execute get_today_view'
);
select ok(
  has_function_privilege('authenticated', 'api.get_captain_day_view(text)', 'EXECUTE'),
  'authenticated can execute get_captain_day_view'
);
select ok(
  has_function_privilege('authenticated', 'api.get_command_receipt(text)', 'EXECUTE'),
  'authenticated can execute get_command_receipt'
);
select ok(
  not has_function_privilege('anon', 'api.get_today_view(text)', 'EXECUTE'),
  'anon cannot execute get_today_view'
);
select ok(
  not has_function_privilege('anon', 'api.get_captain_day_view(text)', 'EXECUTE'),
  'anon cannot execute get_captain_day_view'
);
select ok(
  not has_function_privilege('anon', 'api.get_command_receipt(text)', 'EXECUTE'),
  'anon cannot execute get_command_receipt'
);
select ok(
  not has_table_privilege('authenticated', 'ilka.projection_documents', 'SELECT'),
  'authenticated still cannot read projection_documents directly'
);
select ok(
  not has_table_privilege('authenticated', 'ilka.command_receipts', 'SELECT'),
  'authenticated still cannot read command_receipts directly'
);

insert into ilka.runtime_releases (
  id,
  release_key,
  git_commit_sha,
  rules_release,
  content_release,
  reducer_version
) values (
  '62000000-0000-0000-0000-000000000001',
  'day1_read_api_test',
  '0000000000000000000000000000000000000020',
  'engine_v8_permissions_v7_onboarding_v3',
  'day1_content_v1',
  'day1_complete_task_v1'
);

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  (
    '12000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'participant-read-api@example.test',
    now(),
    now()
  ),
  (
    '12000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'captain-read-api@example.test',
    now(),
    now()
  ),
  (
    '12000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'other-read-api@example.test',
    now(),
    now()
  );

insert into ilka.expeditions (
  id,
  expedition_key,
  name,
  timezone,
  status,
  runtime_release_id,
  created_by_profile_id
)
select
  '52000000-0000-0000-0000-000000000001',
  'day1_read_api',
  'Day 1 Read API',
  'Europe/Athens',
  'active',
  '62000000-0000-0000-0000-000000000001',
  profile.id
from ilka.profiles as profile
where profile.auth_user_id = '12000000-0000-0000-0000-000000000002';

insert into ilka.expedition_members (
  id,
  expedition_id,
  profile_id,
  role
)
select
  valueset.id,
  '52000000-0000-0000-0000-000000000001',
  profile.id,
  valueset.role
from (
  values
    ('32000000-0000-0000-0000-000000000001'::uuid, 'participant'::text, '12000000-0000-0000-0000-000000000001'::uuid),
    ('32000000-0000-0000-0000-000000000002'::uuid, 'captain'::text, '12000000-0000-0000-0000-000000000002'::uuid),
    ('32000000-0000-0000-0000-000000000003'::uuid, 'participant'::text, '12000000-0000-0000-0000-000000000003'::uuid)
) as valueset(id, role, auth_user_id)
join ilka.profiles as profile
  on profile.auth_user_id = valueset.auth_user_id;

insert into ilka.participants (
  id,
  participant_key,
  expedition_id,
  expedition_member_id,
  display_name,
  participant_order
) values
  (
    '42000000-0000-0000-0000-000000000001',
    'participant_read_api',
    '52000000-0000-0000-0000-000000000001',
    '32000000-0000-0000-0000-000000000001',
    'Participant Read API',
    1
  ),
  (
    '42000000-0000-0000-0000-000000000003',
    'participant_other_api',
    '52000000-0000-0000-0000-000000000001',
    '32000000-0000-0000-0000-000000000003',
    'Other Participant',
    2
  );

update ilka.projection_heads
set current_projection_version = 1
where expedition_id = '52000000-0000-0000-0000-000000000001';

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
  generated_at
) values
  (
    '52000000-0000-0000-0000-000000000001',
    'today_view:participant_read_api',
    'today_view',
    'participant_read_api',
    'https://ilka.local/schemas/today-view.schema.json',
    '1',
    jsonb_build_object(
      'expedition_id', 'day1_read_api',
      'participant_id', 'participant_read_api',
      'local_date', '2026-07-20',
      'day', jsonb_build_object('number', 1, 'status', 'active'),
      'stage', jsonb_build_object('stage_id', 'onboarding', 'title', 'Onboarding and Team Contract'),
      'cards', '[]'::jsonb,
      'tasks', jsonb_build_array(jsonb_build_object('task_id', 'task_team_agreement', 'title', 'Team Agreement', 'status', 'available')),
      'sync_status', 'synced',
      'outputs', '[]'::jsonb,
      'expedition_status', 'active',
      'expedition_completion', null
    ),
    1,
    0,
    '62000000-0000-0000-0000-000000000001',
    'day1_complete_task_v1',
    now()
  ),
  (
    '52000000-0000-0000-0000-000000000001',
    'captain_day_view',
    'captain_day_view',
    null,
    'https://ilka.local/schemas/captain-day-view.schema.json',
    '1',
    jsonb_build_object(
      'expedition_id', 'day1_read_api',
      'marker', 'captain_projection'
    ),
    1,
    0,
    '62000000-0000-0000-0000-000000000001',
    'day1_complete_task_v1',
    now()
  );

select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$ select api.get_today_view('day1_read_api') $$,
  '42501',
  'authentication_required',
  'TodayView requires authentication'
);
select throws_ok(
  $$ select api.get_captain_day_view('day1_read_api') $$,
  '42501',
  'authentication_required',
  'CaptainDayView requires authentication'
);
select throws_ok(
  $$ select api.get_command_receipt('cmd_read_api_rejected') $$,
  '42501',
  'authentication_required',
  'receipt lookup requires authentication'
);

select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
select is(
  api.get_today_view('day1_read_api') ->> 'participant_id',
  'participant_read_api',
  'active Participant receives their own TodayView'
);
select throws_ok(
  $$ select api.get_captain_day_view('day1_read_api') $$,
  '42501',
  'active_captain_membership_required',
  'Participant cannot read CaptainDayView'
);

select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000002', true);
select is(
  api.get_captain_day_view('day1_read_api') ->> 'marker',
  'captain_projection',
  'active Captain receives CaptainDayView'
);
select throws_ok(
  $$ select api.get_today_view('day1_read_api') $$,
  '42501',
  'active_participant_membership_required',
  'Captain without Participant identity cannot read a TodayView'
);

select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000003', true);
select is(
  api.get_today_view('day1_read_api'),
  null,
  'another active Participant does not receive another Participant projection'
);

select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
select is(
  api.get_today_view('missing_expedition'),
  null,
  'unknown Expedition returns no projection without leaking data'
);

select private.process_command(
  jsonb_build_object(
    'expedition_id', '52000000-0000-0000-0000-000000000001',
    'command', jsonb_build_object(
      'command_id', 'cmd_read_api_rejected',
      'command_type', 'complete_task',
      'issued_at', '2026-07-20T20:00:00Z',
      'actor_id', 'participant_read_api',
      'actor_role', 'participant',
      'expedition_id', 'day1_read_api',
      'idempotency_key', 'cmd_read_api_rejected',
      'payload', jsonb_build_object('task_id', 'task_team_agreement')
    ),
    'actor_context', jsonb_build_object(
      'auth_user_id', '12000000-0000-0000-0000-000000000001',
      'profile_id', (select id from ilka.profiles where auth_user_id = '12000000-0000-0000-0000-000000000001'),
      'membership_id', '32000000-0000-0000-0000-000000000001',
      'participant_id', '42000000-0000-0000-0000-000000000001',
      'actor_id', 'participant_read_api',
      'actor_role', 'participant'
    ),
    'request_hash', repeat('c', 64),
    'expected_stream_position', 0,
    'status', 'rejected',
    'events', '[]'::jsonb,
    'projection_mutations', '[]'::jsonb,
    'runtime_release_id', '62000000-0000-0000-0000-000000000001',
    'reducer_version', 'day1_complete_task_v1',
    'received_at', '2026-07-20T20:00:01Z',
    'processed_at', '2026-07-20T20:00:02Z',
    'rejection', jsonb_build_object('code', 'task_already_terminal', 'message', 'Already terminal.')
  )
);

select is(
  api.get_command_receipt('cmd_read_api_rejected') #>> '{receipt,rejection_code}',
  'task_already_terminal',
  'original actor can poll the immutable rejected receipt'
);
select is(
  (api.get_command_receipt('cmd_read_api_rejected') ->> 'replayed')::boolean,
  true,
  'receipt API returns replay semantics'
);

select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000002', true);
select is(
  api.get_command_receipt('cmd_read_api_rejected'),
  null,
  'another authenticated actor cannot enumerate a receipt'
);

update ilka.expedition_members
set status = 'banned',
    ban_reason = 'Read API test ban',
    banned_at = now()
where id = '32000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$ select api.get_today_view('day1_read_api') $$,
  '42501',
  'active_participant_membership_required',
  'banned membership cannot read new Participant projections'
);
select is(
  api.get_command_receipt('cmd_read_api_rejected') #>> '{receipt,rejection_code}',
  'task_already_terminal',
  'banned original actor retains access to their historical receipt'
);

select * from finish();
rollback;
