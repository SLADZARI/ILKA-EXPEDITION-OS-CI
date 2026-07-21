begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

create function pg_temp.make_setup_projection(
  p_expedition_key text,
  p_projection_version integer,
  p_active_count integer,
  p_pending_count integer,
  p_participants jsonb,
  p_invitations jsonb
)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'expedition_id', p_expedition_key,
    'expedition_status', 'draft',
    'team', jsonb_build_object(
      'active_participant_count', p_active_count,
      'pending_invitation_count', p_pending_count,
      'minimum', 3,
      'maximum', 5,
      'slots_remaining', 5 - p_active_count - p_pending_count
    ),
    'participants', p_participants,
    'invitations', p_invitations,
    'rotation', jsonb_build_object(
      'status', 'not_generated',
      'rotation_id', null,
      'rules_version', null,
      'assignments', '[]'::jsonb
    ),
    'readiness', jsonb_build_object(
      'can_generate_rotation', false,
      'can_start_expedition', false,
      'blockers', '[]'::jsonb
    ),
    'controls', jsonb_build_object(
      'invite_participant', true,
      'revoke_invitation', true,
      'generate_rotation', false,
      'start_expedition', false
    ),
    'expected_projection_version', p_projection_version,
    'sync_status', 'synced'
  );
$$;

create function pg_temp.make_event(
  p_event_id text,
  p_event_type text,
  p_actor_id text,
  p_actor_role text,
  p_expedition_key text,
  p_command_id text,
  p_payload jsonb,
  p_ordinal integer
)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'event_id', p_event_id,
    'event_type', p_event_type,
    'occurred_at', timestamptz '2026-07-21T17:00:00Z' + make_interval(secs => p_ordinal),
    'recorded_at', timestamptz '2026-07-21T17:00:10Z' + make_interval(secs => p_ordinal),
    'actor_id', p_actor_id,
    'actor_role', p_actor_role,
    'expedition_id', p_expedition_key,
    'day_number', null,
    'stage_id', null,
    'day_revision', null,
    'command_id', p_command_id,
    'idempotency_key', p_command_id,
    'schema_version', 1,
    'payload', p_payload
  );
$$;

create function pg_temp.make_process_request(
  p_expedition_id uuid,
  p_expedition_key text,
  p_runtime_release_id uuid,
  p_reducer_version text,
  p_command_id text,
  p_command_type text,
  p_auth_user_id uuid,
  p_profile_id uuid,
  p_membership_id uuid,
  p_actor_role text,
  p_expected_stream_position integer,
  p_request_hash text,
  p_events jsonb,
  p_projection jsonb,
  p_processed_before_received boolean default false
)
returns jsonb
language sql
as $$
  with valueset as (
    select
      'member_' || replace(p_membership_id::text, '-', '') as actor_id,
      timestamptz '2026-07-21T17:00:00Z' as received_at
  )
  select jsonb_build_object(
    'expedition_id', p_expedition_id,
    'command', jsonb_build_object(
      'command_id', p_command_id,
      'command_type', p_command_type,
      'issued_at', valueset.received_at,
      'actor_id', valueset.actor_id,
      'actor_role', p_actor_role,
      'expedition_id', p_expedition_key,
      'idempotency_key', p_command_id,
      'day_number', null,
      'stage_id', null,
      'day_revision', null,
      'payload', '{}'::jsonb
    ),
    'actor_context', jsonb_build_object(
      'auth_user_id', p_auth_user_id,
      'profile_id', p_profile_id,
      'membership_id', p_membership_id,
      'participant_id', null,
      'actor_id', valueset.actor_id,
      'actor_role', p_actor_role
    ),
    'request_hash', p_request_hash,
    'expected_stream_position', p_expected_stream_position,
    'status', 'accepted',
    'events', p_events,
    'projection_mutations', jsonb_build_array(jsonb_build_object(
      'operation', 'upsert',
      'projection_key', 'expedition_setup_view',
      'projection_type', 'expedition_setup_view',
      'subject_id', null,
      'schema_id', 'https://ilka.local/schemas/expedition-setup-view.schema.json',
      'schema_version', '1',
      'projection', p_projection
    )),
    'runtime_release_id', p_runtime_release_id,
    'reducer_version', p_reducer_version,
    'received_at', valueset.received_at,
    'processed_at', case
      when p_processed_before_received then valueset.received_at - interval '1 second'
      else valueset.received_at + interval '20 seconds'
    end,
    'rejection', null
  )
  from valueset;
$$;

select has_function('private', 'invite_participant', array['jsonb'], 'private.invite_participant(jsonb) exists');
select has_function('private', 'accept_invitation', array['jsonb'], 'private.accept_invitation(jsonb) exists');
select has_function('private', 'revoke_invitation', array['jsonb'], 'private.revoke_invitation(jsonb) exists');
select has_function('api', 'get_expedition_setup_view', array['text'], 'api.get_expedition_setup_view(text) exists');

select ok(has_function_privilege('service_role', 'private.invite_participant(jsonb)', 'EXECUTE'), 'service_role can execute invite wrapper');
select ok(has_function_privilege('service_role', 'private.accept_invitation(jsonb)', 'EXECUTE'), 'service_role can execute accept wrapper');
select ok(has_function_privilege('service_role', 'private.revoke_invitation(jsonb)', 'EXECUTE'), 'service_role can execute revoke wrapper');
select ok(not has_function_privilege('authenticated', 'private.invite_participant(jsonb)', 'EXECUTE'), 'authenticated cannot execute private invite wrapper');
select ok(not has_function_privilege('authenticated', 'private.accept_invitation(jsonb)', 'EXECUTE'), 'authenticated cannot execute private accept wrapper');
select ok(not has_function_privilege('authenticated', 'private.revoke_invitation(jsonb)', 'EXECUTE'), 'authenticated cannot execute private revoke wrapper');
select ok(has_function_privilege('authenticated', 'api.get_expedition_setup_view(text)', 'EXECUTE'), 'authenticated can execute setup read API');
select ok(not has_function_privilege('anon', 'api.get_expedition_setup_view(text)', 'EXECUTE'), 'anon cannot execute setup read API');

select ok(
  (
    select bool_and(proc.prosecdef and proc.proconfig @> array['search_path=""']::text[])
    from pg_proc as proc
    join pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname in ('private', 'api')
      and proc.proname in ('invite_participant', 'accept_invitation', 'revoke_invitation', 'get_expedition_setup_view')
  ),
  'all Gate 9B2B functions are SECURITY DEFINER with empty search_path'
);

insert into ilka.runtime_releases (
  id,
  release_key,
  git_commit_sha,
  rules_release,
  content_release,
  reducer_version
) values (
  '92000000-0000-0000-0000-000000000001',
  'gate9b2b_test',
  '0000000000000000000000000000000000000092',
  'gate9b2b-rules',
  'gate9b2b-content',
  'gate9b2b-v1'
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  created_at,
  updated_at
) values
  (
    '91000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'captain-gate9b2b@example.test',
    now(),
    now(),
    now()
  ),
  (
    '91000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'participant-gate9b2b@example.test',
    now(),
    now(),
    now()
  ),
  (
    '91000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'revoked-gate9b2b@example.test',
    now(),
    now(),
    now()
  );

create temporary table gate9b2b_profiles as
select auth_user_id, id as profile_id
from ilka.profiles
where auth_user_id in (
  '91000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000002',
  '91000000-0000-0000-0000-000000000003'
);

insert into ilka.expeditions (
  id,
  expedition_key,
  name,
  timezone,
  runtime_release_id,
  created_by_profile_id
)
select
  '93000000-0000-0000-0000-000000000001',
  'gate9b2b_test',
  'Gate 9B2B Test',
  'Europe/Warsaw',
  '92000000-0000-0000-0000-000000000001',
  profile.profile_id
from gate9b2b_profiles as profile
where profile.auth_user_id = '91000000-0000-0000-0000-000000000001';

insert into ilka.expedition_members (
  id,
  expedition_id,
  profile_id,
  role,
  status
)
select
  '94000000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000001',
  profile.profile_id,
  'captain',
  'active'
from gate9b2b_profiles as profile
where profile.auth_user_id = '91000000-0000-0000-0000-000000000001';

create temporary table gate9b2b_requests (
  request_key text primary key,
  request jsonb not null
);
create temporary table gate9b2b_results (
  result_key text primary key,
  result jsonb not null
);

insert into gate9b2b_requests (request_key, request)
select
  'invite_a',
  jsonb_build_object(
    'invitation', jsonb_build_object(
      'id', '95000000-0000-0000-0000-000000000001',
      'expedition_id', '93000000-0000-0000-0000-000000000001',
      'email_normalized', 'participant-gate9b2b@example.test',
      'role', 'participant',
      'token_hash', repeat('a', 64),
      'invited_by_membership_id', '94000000-0000-0000-0000-000000000001',
      'expires_at', '2099-01-01T00:00:00Z'
    ),
    'process_command_request', pg_temp.make_process_request(
      '93000000-0000-0000-0000-000000000001',
      'gate9b2b_test',
      '92000000-0000-0000-0000-000000000001',
      'gate9b2b-v1',
      'cmd_gate9b2b_invite_a',
      'invite_participant',
      '91000000-0000-0000-0000-000000000001',
      profile.profile_id,
      '94000000-0000-0000-0000-000000000001',
      'captain',
      0,
      repeat('1', 64),
      jsonb_build_array(pg_temp.make_event(
        'evt_gate9b2b_invite_a_01',
        'invitation.created',
        'member_94000000000000000000000000000001',
        'captain',
        'gate9b2b_test',
        'cmd_gate9b2b_invite_a',
        jsonb_build_object(
          'invitation_id', 'invitation_95000000000000000000000000000001',
          'email_hint', 'p***@example.test',
          'role', 'participant',
          'expires_at', '2099-01-01T00:00:00Z'
        ),
        1
      )),
      pg_temp.make_setup_projection(
        'gate9b2b_test',
        1,
        0,
        1,
        '[]'::jsonb,
        jsonb_build_array(jsonb_build_object(
          'invitation_id', 'invitation_95000000000000000000000000000001',
          'email_hint', 'p***@example.test',
          'role', 'participant',
          'status', 'pending',
          'expires_at', '2099-01-01T00:00:00Z',
          'accepted_participant_id', null
        ))
      )
    )
  )
from gate9b2b_profiles as profile
where profile.auth_user_id = '91000000-0000-0000-0000-000000000001';

select lives_ok(
  $$
    insert into gate9b2b_results (result_key, result)
    select 'invite_a', private.invite_participant(request)
    from gate9b2b_requests where request_key = 'invite_a'
  $$,
  'valid invite commits invitation, receipt, event and setup projection atomically'
);
select is((select result ->> 'outcome' from gate9b2b_results where result_key = 'invite_a'), 'accepted', 'invite returns accepted');
select is((select count(*)::integer from ilka.invitations where id = '95000000-0000-0000-0000-000000000001' and status = 'pending'), 1, 'invite creates one pending invitation');
select is((select count(*)::integer from ilka.event_log where command_id = 'cmd_gate9b2b_invite_a' and event_type = 'invitation.created'), 1, 'invite appends one invitation.created event');
select is((select current_stream_position::integer from ilka.stream_heads where expedition_id = '93000000-0000-0000-0000-000000000001'), 1, 'invite advances stream once');
select is((select current_projection_version::integer from ilka.projection_heads where expedition_id = '93000000-0000-0000-0000-000000000001'), 1, 'invite advances setup projection once');
select is((select projection_json ->> 'sync_status' from ilka.projection_documents where expedition_id = '93000000-0000-0000-0000-000000000001' and projection_key = 'expedition_setup_view'), 'synced', 'invite persists synced ExpeditionSetupView');
select ok((select position('participant-gate9b2b@example.test' in event_json::text) = 0 from ilka.event_log where command_id = 'cmd_gate9b2b_invite_a'), 'event contains no full invitation email');
select ok((select position(repeat('a', 64) in lower(event_json::text)) = 0 from ilka.event_log where command_id = 'cmd_gate9b2b_invite_a'), 'event contains no invitation token hash');
select ok((select position('participant-gate9b2b@example.test' in projection_json::text) = 0 from ilka.projection_documents where expedition_id = '93000000-0000-0000-0000-000000000001' and projection_key = 'expedition_setup_view'), 'projection contains no full invitation email');

select lives_ok(
  $$
    insert into gate9b2b_results (result_key, result)
    select
      'invite_a_replay',
      private.invite_participant(
        jsonb_set(request, '{invitation,id}', '"95000000-0000-0000-0000-000000000099"'::jsonb)
      )
    from gate9b2b_requests where request_key = 'invite_a'
  $$,
  'exact invite retry returns stored result before structural UUID checks'
);
select ok((select (result ->> 'replayed')::boolean from gate9b2b_results where result_key = 'invite_a_replay'), 'invite retry is replayed');
select is((select count(*)::integer from ilka.invitations where expedition_id = '93000000-0000-0000-0000-000000000001'), 1, 'invite replay creates no duplicate invitation');
select is((select count(*)::integer from ilka.event_log where command_id = 'cmd_gate9b2b_invite_a'), 1, 'invite replay creates no duplicate event');

select throws_ok(
  $$
    select private.invite_participant(
      jsonb_set(request, '{process_command_request,request_hash}', to_jsonb(repeat('2', 64)))
    )
    from gate9b2b_requests where request_key = 'invite_a'
  $$,
  '23514',
  'idempotency_key_reused_with_different_payload',
  'invite command ID cannot be reused with another request hash'
);

insert into gate9b2b_requests (request_key, request)
select
  'accept_a',
  jsonb_build_object(
    'auth_identity', jsonb_build_object(
      'auth_user_id', '91000000-0000-0000-0000-000000000002',
      'profile_id', profile.profile_id,
      'email_normalized', 'participant-gate9b2b@example.test',
      'email_verified', true,
      'profile_status', 'active'
    ),
    'invitation_match', jsonb_build_object(
      'invitation_id', '95000000-0000-0000-0000-000000000001',
      'expedition_id', '93000000-0000-0000-0000-000000000001',
      'token_hash', repeat('a', 64),
      'email_normalized', 'participant-gate9b2b@example.test',
      'expected_status', 'pending'
    ),
    'participant_membership', jsonb_build_object(
      'id', '96000000-0000-0000-0000-000000000001',
      'expedition_id', '93000000-0000-0000-0000-000000000001',
      'profile_id', profile.profile_id,
      'role', 'participant',
      'status', 'active'
    ),
    'participant', jsonb_build_object(
      'id', '97000000-0000-0000-0000-000000000001',
      'expedition_id', '93000000-0000-0000-0000-000000000001',
      'expedition_member_id', '96000000-0000-0000-0000-000000000001',
      'participant_key', 'participant_97000000000000000000000000000001',
      'participant_order', 1,
      'display_name', 'Anna',
      'status', 'active'
    ),
    'process_command_request', pg_temp.make_process_request(
      '93000000-0000-0000-0000-000000000001',
      'gate9b2b_test',
      '92000000-0000-0000-0000-000000000001',
      'gate9b2b-v1',
      'cmd_gate9b2b_accept_a',
      'accept_invitation',
      '91000000-0000-0000-0000-000000000002',
      profile.profile_id,
      '96000000-0000-0000-0000-000000000001',
      'participant',
      1,
      repeat('3', 64),
      jsonb_build_array(
        pg_temp.make_event(
          'evt_gate9b2b_accept_a_01',
          'invitation.accepted',
          'member_96000000000000000000000000000001',
          'participant',
          'gate9b2b_test',
          'cmd_gate9b2b_accept_a',
          jsonb_build_object(
            'invitation_id', 'invitation_95000000000000000000000000000001',
            'participant_id', 'participant_97000000000000000000000000000001'
          ),
          1
        ),
        pg_temp.make_event(
          'evt_gate9b2b_accept_a_02',
          'participant.added',
          'member_96000000000000000000000000000001',
          'participant',
          'gate9b2b_test',
          'cmd_gate9b2b_accept_a',
          jsonb_build_object(
            'participant_id', 'participant_97000000000000000000000000000001',
            'display_name', 'Anna',
            'participant_order', 1
          ),
          2
        )
      ),
      pg_temp.make_setup_projection(
        'gate9b2b_test',
        2,
        1,
        0,
        jsonb_build_array(jsonb_build_object(
          'participant_id', 'participant_97000000000000000000000000000001',
          'display_name', 'Anna',
          'participant_order', 1,
          'status', 'active'
        )),
        jsonb_build_array(jsonb_build_object(
          'invitation_id', 'invitation_95000000000000000000000000000001',
          'email_hint', 'p***@example.test',
          'role', 'participant',
          'status', 'accepted',
          'expires_at', '2099-01-01T00:00:00Z',
          'accepted_participant_id', 'participant_97000000000000000000000000000001'
        ))
      )
    )
  )
from gate9b2b_profiles as profile
where profile.auth_user_id = '91000000-0000-0000-0000-000000000002';

select lives_ok(
  $$
    insert into gate9b2b_results (result_key, result)
    select 'accept_a', private.accept_invitation(request)
    from gate9b2b_requests where request_key = 'accept_a'
  $$,
  'valid acceptance commits invitation, membership, Participant, receipt, ordered events and setup projection atomically'
);
select is((select status from ilka.invitations where id = '95000000-0000-0000-0000-000000000001'), 'accepted', 'acceptance marks invitation accepted');
select is((select count(*)::integer from ilka.expedition_members where id = '96000000-0000-0000-0000-000000000001' and role = 'participant' and status = 'active'), 1, 'acceptance creates one active participant membership');
select is((select count(*)::integer from ilka.participants where id = '97000000-0000-0000-0000-000000000001' and participant_order = 1), 1, 'acceptance creates Participant at lowest free order');
select is((select current_stream_position::integer from ilka.stream_heads where expedition_id = '93000000-0000-0000-0000-000000000001'), 3, 'acceptance appends two ordered events');
select is((select current_projection_version::integer from ilka.projection_heads where expedition_id = '93000000-0000-0000-0000-000000000001'), 2, 'acceptance advances projection once');
select results_eq(
  $$ select event_type from ilka.event_log where command_id = 'cmd_gate9b2b_accept_a' order by stream_position $$,
  array['invitation.accepted'::text, 'participant.added'::text],
  'acceptance event order is invitation.accepted then participant.added'
);
select is((select event_json ->> 'actor_id' from ilka.event_log where command_id = 'cmd_gate9b2b_accept_a' order by stream_position limit 1), 'member_96000000000000000000000000000001', 'acceptance history uses membership actor');
select is((select actor_participant_id from ilka.command_receipts where command_id = 'cmd_gate9b2b_accept_a'), null::uuid, 'acceptance receipt does not pretend Participant existed before persistence');
select results_eq(
  $$
    select participant_id
    from private.resolve_actor_context(
      '91000000-0000-0000-0000-000000000002',
      '93000000-0000-0000-0000-000000000001'
    )
  $$,
  array['97000000-0000-0000-0000-000000000001'::uuid],
  'accepted actor resolves the new Participant after atomic commit'
);

select lives_ok(
  $$
    insert into gate9b2b_results (result_key, result)
    select
      'accept_a_replay',
      private.accept_invitation(
        jsonb_set(
          jsonb_set(
            jsonb_set(request, '{participant_membership,id}', '"96000000-0000-0000-0000-000000000099"'::jsonb),
            '{participant,id}', '"97000000-0000-0000-0000-000000000099"'::jsonb
          ),
          '{participant,expedition_member_id}', '"96000000-0000-0000-0000-000000000099"'::jsonb
        )
      )
    from gate9b2b_requests where request_key = 'accept_a'
  $$,
  'exact acceptance replay ignores regenerated structural UUIDs and returns original receipt'
);
select ok((select (result ->> 'replayed')::boolean from gate9b2b_results where result_key = 'accept_a_replay'), 'acceptance retry is replayed');
select is((select count(*)::integer from ilka.expedition_members where expedition_id = '93000000-0000-0000-0000-000000000001' and role = 'participant'), 1, 'acceptance replay creates no duplicate membership');
select is((select count(*)::integer from ilka.participants where expedition_id = '93000000-0000-0000-0000-000000000001'), 1, 'acceptance replay creates no duplicate Participant');
select is((select count(*)::integer from ilka.event_log where command_id = 'cmd_gate9b2b_accept_a'), 2, 'acceptance replay creates no duplicate events');

insert into gate9b2b_requests (request_key, request)
select
  'invite_b',
  jsonb_build_object(
    'invitation', jsonb_build_object(
      'id', '95000000-0000-0000-0000-000000000002',
      'expedition_id', '93000000-0000-0000-0000-000000000001',
      'email_normalized', 'revoked-gate9b2b@example.test',
      'role', 'participant',
      'token_hash', repeat('b', 64),
      'invited_by_membership_id', '94000000-0000-0000-0000-000000000001',
      'expires_at', '2099-01-02T00:00:00Z'
    ),
    'process_command_request', pg_temp.make_process_request(
      '93000000-0000-0000-0000-000000000001',
      'gate9b2b_test',
      '92000000-0000-0000-0000-000000000001',
      'gate9b2b-v1',
      'cmd_gate9b2b_invite_b',
      'invite_participant',
      '91000000-0000-0000-0000-000000000001',
      profile.profile_id,
      '94000000-0000-0000-0000-000000000001',
      'captain',
      3,
      repeat('4', 64),
      jsonb_build_array(pg_temp.make_event(
        'evt_gate9b2b_invite_b_01',
        'invitation.created',
        'member_94000000000000000000000000000001',
        'captain',
        'gate9b2b_test',
        'cmd_gate9b2b_invite_b',
        jsonb_build_object(
          'invitation_id', 'invitation_95000000000000000000000000000002',
          'email_hint', 'r***@example.test',
          'role', 'participant',
          'expires_at', '2099-01-02T00:00:00Z'
        ),
        1
      )),
      pg_temp.make_setup_projection(
        'gate9b2b_test',
        3,
        1,
        1,
        jsonb_build_array(jsonb_build_object(
          'participant_id', 'participant_97000000000000000000000000000001',
          'display_name', 'Anna',
          'participant_order', 1,
          'status', 'active'
        )),
        jsonb_build_array(
          jsonb_build_object(
            'invitation_id', 'invitation_95000000000000000000000000000001',
            'email_hint', 'p***@example.test',
            'role', 'participant',
            'status', 'accepted',
            'expires_at', '2099-01-01T00:00:00Z',
            'accepted_participant_id', 'participant_97000000000000000000000000000001'
          ),
          jsonb_build_object(
            'invitation_id', 'invitation_95000000000000000000000000000002',
            'email_hint', 'r***@example.test',
            'role', 'participant',
            'status', 'pending',
            'expires_at', '2099-01-02T00:00:00Z',
            'accepted_participant_id', null
          )
        )
      )
    )
  )
from gate9b2b_profiles as profile
where profile.auth_user_id = '91000000-0000-0000-0000-000000000001';

select lives_ok(
  $$
    insert into gate9b2b_results (result_key, result)
    select 'invite_b', private.invite_participant(request)
    from gate9b2b_requests where request_key = 'invite_b'
  $$,
  'second invitation can be created after first acceptance'
);

insert into gate9b2b_requests (request_key, request)
select
  'revoke_b',
  jsonb_build_object(
    'invitation_transition', jsonb_build_object(
      'invitation_id', '95000000-0000-0000-0000-000000000002',
      'expedition_id', '93000000-0000-0000-0000-000000000001',
      'expected_status', 'pending',
      'revoked_by_profile_id', profile.profile_id,
      'reason', 'Participant cannot join the expedition.'
    ),
    'process_command_request', pg_temp.make_process_request(
      '93000000-0000-0000-0000-000000000001',
      'gate9b2b_test',
      '92000000-0000-0000-0000-000000000001',
      'gate9b2b-v1',
      'cmd_gate9b2b_revoke_b',
      'revoke_invitation',
      '91000000-0000-0000-0000-000000000001',
      profile.profile_id,
      '94000000-0000-0000-0000-000000000001',
      'captain',
      4,
      repeat('5', 64),
      jsonb_build_array(pg_temp.make_event(
        'evt_gate9b2b_revoke_b_01',
        'invitation.revoked',
        'member_94000000000000000000000000000001',
        'captain',
        'gate9b2b_test',
        'cmd_gate9b2b_revoke_b',
        jsonb_build_object(
          'invitation_id', 'invitation_95000000000000000000000000000002',
          'reason', 'Participant cannot join the expedition.'
        ),
        1
      )),
      pg_temp.make_setup_projection(
        'gate9b2b_test',
        4,
        1,
        0,
        jsonb_build_array(jsonb_build_object(
          'participant_id', 'participant_97000000000000000000000000000001',
          'display_name', 'Anna',
          'participant_order', 1,
          'status', 'active'
        )),
        jsonb_build_array(
          jsonb_build_object(
            'invitation_id', 'invitation_95000000000000000000000000000001',
            'email_hint', 'p***@example.test',
            'role', 'participant',
            'status', 'accepted',
            'expires_at', '2099-01-01T00:00:00Z',
            'accepted_participant_id', 'participant_97000000000000000000000000000001'
          ),
          jsonb_build_object(
            'invitation_id', 'invitation_95000000000000000000000000000002',
            'email_hint', 'r***@example.test',
            'role', 'participant',
            'status', 'revoked',
            'expires_at', '2099-01-02T00:00:00Z',
            'accepted_participant_id', null
          )
        )
      )
    )
  )
from gate9b2b_profiles as profile
where profile.auth_user_id = '91000000-0000-0000-0000-000000000001';

select lives_ok(
  $$
    insert into gate9b2b_results (result_key, result)
    select 'revoke_b', private.revoke_invitation(request)
    from gate9b2b_requests where request_key = 'revoke_b'
  $$,
  'valid revocation commits terminal invitation state, receipt, event and setup projection atomically'
);
select is((select status from ilka.invitations where id = '95000000-0000-0000-0000-000000000002'), 'revoked', 'revoke marks invitation terminal');
select is((select count(*)::integer from ilka.event_log where command_id = 'cmd_gate9b2b_revoke_b' and event_type = 'invitation.revoked'), 1, 'revoke appends one invitation.revoked event');

select lives_ok(
  $$
    insert into gate9b2b_results (result_key, result)
    select 'revoke_b_replay', private.revoke_invitation(request)
    from gate9b2b_requests where request_key = 'revoke_b'
  $$,
  'exact revocation retry returns stored result before terminal-state guard'
);
select ok((select (result ->> 'replayed')::boolean from gate9b2b_results where result_key = 'revoke_b_replay'), 'revocation retry is replayed');
select is((select count(*)::integer from ilka.event_log where command_id = 'cmd_gate9b2b_revoke_b'), 1, 'revocation replay creates no duplicate event');

select throws_ok(
  $$
    select private.accept_invitation(jsonb_build_object(
      'auth_identity', jsonb_build_object(
        'auth_user_id', '91000000-0000-0000-0000-000000000003',
        'profile_id', profile.profile_id,
        'email_normalized', 'revoked-gate9b2b@example.test',
        'email_verified', true,
        'profile_status', 'active'
      ),
      'invitation_match', jsonb_build_object(
        'invitation_id', '95000000-0000-0000-0000-000000000002',
        'expedition_id', '93000000-0000-0000-0000-000000000001',
        'token_hash', repeat('b', 64),
        'email_normalized', 'revoked-gate9b2b@example.test',
        'expected_status', 'pending'
      ),
      'participant_membership', jsonb_build_object(
        'id', '96000000-0000-0000-0000-000000000002',
        'expedition_id', '93000000-0000-0000-0000-000000000001',
        'profile_id', profile.profile_id,
        'role', 'participant',
        'status', 'active'
      ),
      'participant', jsonb_build_object(
        'id', '97000000-0000-0000-0000-000000000002',
        'expedition_id', '93000000-0000-0000-0000-000000000001',
        'expedition_member_id', '96000000-0000-0000-0000-000000000002',
        'participant_key', 'participant_97000000000000000000000000000002',
        'participant_order', 2,
        'display_name', 'Revoked Candidate',
        'status', 'active'
      ),
      'process_command_request', pg_temp.make_process_request(
        '93000000-0000-0000-0000-000000000001',
        'gate9b2b_test',
        '92000000-0000-0000-0000-000000000001',
        'gate9b2b-v1',
        'cmd_gate9b2b_accept_revoked',
        'accept_invitation',
        '91000000-0000-0000-0000-000000000003',
        profile.profile_id,
        '96000000-0000-0000-0000-000000000002',
        'participant',
        5,
        repeat('6', 64),
        jsonb_build_array(
          pg_temp.make_event(
            'evt_gate9b2b_accept_revoked_01',
            'invitation.accepted',
            'member_96000000000000000000000000000002',
            'participant',
            'gate9b2b_test',
            'cmd_gate9b2b_accept_revoked',
            jsonb_build_object(
              'invitation_id', 'invitation_95000000000000000000000000000002',
              'participant_id', 'participant_97000000000000000000000000000002'
            ),
            1
          ),
          pg_temp.make_event(
            'evt_gate9b2b_accept_revoked_02',
            'participant.added',
            'member_96000000000000000000000000000002',
            'participant',
            'gate9b2b_test',
            'cmd_gate9b2b_accept_revoked',
            jsonb_build_object(
              'participant_id', 'participant_97000000000000000000000000000002',
              'display_name', 'Revoked Candidate',
              'participant_order', 2
            ),
            2
          )
        ),
        pg_temp.make_setup_projection('gate9b2b_test', 5, 2, 0, '[]'::jsonb, '[]'::jsonb)
      )
    ))
    from gate9b2b_profiles as profile
    where profile.auth_user_id = '91000000-0000-0000-0000-000000000003'
  $$,
  '23514',
  'invitation_not_pending',
  'acceptance and revocation race has one terminal winner'
);
select is((select count(*)::integer from ilka.expedition_members where id = '96000000-0000-0000-0000-000000000002'), 0, 'losing terminal transition creates no membership');

insert into gate9b2b_requests (request_key, request)
select
  'invite_rollback',
  jsonb_build_object(
    'invitation', jsonb_build_object(
      'id', '95000000-0000-0000-0000-000000000003',
      'expedition_id', '93000000-0000-0000-0000-000000000001',
      'email_normalized', 'rollback-gate9b2b@example.test',
      'role', 'participant',
      'token_hash', repeat('c', 64),
      'invited_by_membership_id', '94000000-0000-0000-0000-000000000001',
      'expires_at', '2099-01-03T00:00:00Z'
    ),
    'process_command_request', pg_temp.make_process_request(
      '93000000-0000-0000-0000-000000000001',
      'gate9b2b_test',
      '92000000-0000-0000-0000-000000000001',
      'gate9b2b-v1',
      'cmd_gate9b2b_invite_rollback',
      'invite_participant',
      '91000000-0000-0000-0000-000000000001',
      profile.profile_id,
      '94000000-0000-0000-0000-000000000001',
      'captain',
      5,
      repeat('7', 64),
      jsonb_build_array(pg_temp.make_event(
        'evt_gate9b2b_invite_rollback_01',
        'invitation.created',
        'member_94000000000000000000000000000001',
        'captain',
        'gate9b2b_test',
        'cmd_gate9b2b_invite_rollback',
        jsonb_build_object(
          'invitation_id', 'invitation_95000000000000000000000000000003',
          'email_hint', 'r***@example.test',
          'role', 'participant',
          'expires_at', '2099-01-03T00:00:00Z'
        ),
        1
      )),
      pg_temp.make_setup_projection('gate9b2b_test', 5, 1, 1, '[]'::jsonb, jsonb_build_array(jsonb_build_object(
        'invitation_id', 'invitation_95000000000000000000000000000003',
        'email_hint', 'r***@example.test',
        'role', 'participant',
        'status', 'pending',
        'expires_at', '2099-01-03T00:00:00Z',
        'accepted_participant_id', null
      ))),
      true
    )
  )
from gate9b2b_profiles as profile
where profile.auth_user_id = '91000000-0000-0000-0000-000000000001';

select throws_ok(
  $$
    select private.invite_participant(request)
    from gate9b2b_requests where request_key = 'invite_rollback'
  $$,
  '22023',
  'invalid_processing_timestamps',
  'failure inside private.process_command rolls back invitation creation'
);
select is((select count(*)::integer from ilka.invitations where id = '95000000-0000-0000-0000-000000000003'), 0, 'process-command failure leaves no partial invitation');
select is((select count(*)::integer from ilka.command_receipts where command_id = 'cmd_gate9b2b_invite_rollback'), 0, 'process-command failure leaves no receipt');

insert into gate9b2b_requests (request_key, request)
select
  'invite_conflict',
  jsonb_build_object(
    'invitation', jsonb_build_object(
      'id', '95000000-0000-0000-0000-000000000004',
      'expedition_id', '93000000-0000-0000-0000-000000000001',
      'email_normalized', 'conflict-gate9b2b@example.test',
      'role', 'participant',
      'token_hash', repeat('d', 64),
      'invited_by_membership_id', '94000000-0000-0000-0000-000000000001',
      'expires_at', '2099-01-04T00:00:00Z'
    ),
    'process_command_request', pg_temp.make_process_request(
      '93000000-0000-0000-0000-000000000001',
      'gate9b2b_test',
      '92000000-0000-0000-0000-000000000001',
      'gate9b2b-v1',
      'cmd_gate9b2b_invite_conflict',
      'invite_participant',
      '91000000-0000-0000-0000-000000000001',
      profile.profile_id,
      '94000000-0000-0000-0000-000000000001',
      'captain',
      4,
      repeat('8', 64),
      jsonb_build_array(pg_temp.make_event(
        'evt_gate9b2b_invite_conflict_01',
        'invitation.created',
        'member_94000000000000000000000000000001',
        'captain',
        'gate9b2b_test',
        'cmd_gate9b2b_invite_conflict',
        jsonb_build_object(
          'invitation_id', 'invitation_95000000000000000000000000000004',
          'email_hint', 'c***@example.test',
          'role', 'participant',
          'expires_at', '2099-01-04T00:00:00Z'
        ),
        1
      )),
      pg_temp.make_setup_projection('gate9b2b_test', 5, 1, 1, '[]'::jsonb, jsonb_build_array(jsonb_build_object(
        'invitation_id', 'invitation_95000000000000000000000000000004',
        'email_hint', 'c***@example.test',
        'role', 'participant',
        'status', 'pending',
        'expires_at', '2099-01-04T00:00:00Z',
        'accepted_participant_id', null
      )))
    )
  )
from gate9b2b_profiles as profile
where profile.auth_user_id = '91000000-0000-0000-0000-000000000001';

select throws_ok(
  $$
    select private.invite_participant(request)
    from gate9b2b_requests where request_key = 'invite_conflict'
  $$,
  '40001',
  'version_conflict',
  'stale stream conflict rolls back invitation identity mutation'
);
select is((select count(*)::integer from ilka.invitations where id = '95000000-0000-0000-0000-000000000004'), 0, 'version conflict leaves no partial invitation');

select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$ select api.get_expedition_setup_view('gate9b2b_test') $$,
  '42501',
  'authentication_required',
  'ExpeditionSetupView requires authentication'
);

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$ select api.get_expedition_setup_view('gate9b2b_test') $$,
  '42501',
  'active_captain_membership_required',
  'Participant cannot read Captain setup projection'
);

select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
select is(
  api.get_expedition_setup_view('gate9b2b_test') ->> 'expected_projection_version',
  '4',
  'active Captain receives authoritative ExpeditionSetupView'
);
select is(
  api.get_expedition_setup_view('missing_gate9b2b')::text,
  null::text,
  'unknown Expedition returns null without identity enumeration'
);

select * from finish();
rollback;
