begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select no_plan();

select has_table('ilka', 'profiles', 'profile identity table exists');
select has_table('ilka', 'expeditions', 'Expedition identity table exists');
select has_table('ilka', 'expedition_members', 'Expedition membership table exists');
select has_table('ilka', 'participants', 'domain Participant table exists');
select has_table('ilka', 'invitations', 'hashed invitation table exists');

select has_pk('ilka', 'profiles', 'profiles has a primary key');
select has_pk('ilka', 'expeditions', 'expeditions has a primary key');
select has_pk('ilka', 'expedition_members', 'expedition_members has a primary key');
select has_pk('ilka', 'participants', 'participants has a primary key');
select has_pk('ilka', 'invitations', 'invitations has a primary key');

select has_column('ilka', 'profiles', 'auth_user_id', 'profiles separates Auth identity from profile identity');
select has_column('ilka', 'expeditions', 'runtime_release_id', 'Expeditions pin one immutable runtime release');
select has_column('ilka', 'expedition_members', 'role', 'membership stores Expedition-scoped role');
select has_column('ilka', 'expedition_members', 'status', 'membership stores active, banned or revoked state');
select has_column('ilka', 'participants', 'expedition_member_id', 'Participant is linked to one membership');
select has_column('ilka', 'invitations', 'token_hash', 'invitation persists only a token hash');
select has_column('ilka', 'invitations', 'expires_at', 'invitation expiry is explicit');

select has_trigger('ilka', 'profiles', 'profiles_set_updated_at', 'profile updates are timestamped');
select has_trigger('ilka', 'participants', 'participants_enforce_membership_role', 'Participant linkage validates membership role');
select has_trigger('ilka', 'invitations', 'invitations_enforce_update', 'invitation identity and terminal state are protected');

select ok(
  (select relrowsecurity and relforcerowsecurity
     from pg_class
    where oid = 'ilka.profiles'::regclass),
  'profiles uses forced RLS as defense in depth'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
     from pg_class
    where oid = 'ilka.expeditions'::regclass),
  'expeditions uses forced RLS as defense in depth'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
     from pg_class
    where oid = 'ilka.expedition_members'::regclass),
  'expedition_members uses forced RLS as defense in depth'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
     from pg_class
    where oid = 'ilka.participants'::regclass),
  'participants uses forced RLS as defense in depth'
);
select ok(
  (select relrowsecurity and relforcerowsecurity
     from pg_class
    where oid = 'ilka.invitations'::regclass),
  'invitations uses forced RLS as defense in depth'
);

select ok(not has_table_privilege('anon', 'ilka.profiles', 'SELECT'), 'anon cannot read profiles');
select ok(not has_table_privilege('authenticated', 'ilka.profiles', 'SELECT'), 'authenticated cannot read profiles directly');
select ok(not has_table_privilege('authenticated', 'ilka.expeditions', 'SELECT'), 'authenticated cannot read Expeditions directly');
select ok(not has_table_privilege('authenticated', 'ilka.expedition_members', 'SELECT'), 'authenticated cannot read memberships directly');
select ok(not has_table_privilege('authenticated', 'ilka.participants', 'SELECT'), 'authenticated cannot read Participants directly');
select ok(not has_table_privilege('authenticated', 'ilka.invitations', 'SELECT'), 'authenticated cannot read invitations directly');

select ok(has_table_privilege('service_role', 'ilka.profiles', 'SELECT'), 'service_role can read profiles');
select ok(has_table_privilege('service_role', 'ilka.expeditions', 'INSERT'), 'service_role can create Expeditions');
select ok(has_table_privilege('service_role', 'ilka.expedition_members', 'UPDATE'), 'service_role can update membership state');
select ok(has_table_privilege('service_role', 'ilka.participants', 'INSERT'), 'service_role can create Participants');
select ok(has_table_privilege('service_role', 'ilka.invitations', 'UPDATE'), 'service_role can complete invitation state transitions');
select ok(not has_table_privilege('service_role', 'ilka.profiles', 'DELETE'), 'profiles are not directly deletable by service_role');
select ok(not has_table_privilege('service_role', 'ilka.expeditions', 'DELETE'), 'Expeditions are not directly deletable by service_role');
select ok(not has_table_privilege('service_role', 'ilka.expedition_members', 'DELETE'), 'memberships are not directly deletable by service_role');
select ok(not has_table_privilege('service_role', 'ilka.participants', 'DELETE'), 'Participants are not directly deletable by service_role');
select ok(not has_table_privilege('service_role', 'ilka.invitations', 'DELETE'), 'invitations are not directly deletable by service_role');

select ok(
  exists (
    select 1
      from pg_proc
     where oid = 'private.resolve_actor_context(uuid,uuid)'::regprocedure
  ),
  'server-only actor context resolver exists'
);
select ok(
  has_function_privilege('service_role', 'private.resolve_actor_context(uuid,uuid)', 'EXECUTE'),
  'service_role can resolve authoritative actor context'
);
select ok(
  not has_function_privilege('authenticated', 'private.resolve_actor_context(uuid,uuid)', 'EXECUTE'),
  'authenticated cannot call the private actor resolver'
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
      '20000000-0000-0000-0000-000000000001',
      'identity_membership_test',
      '0000000000000000000000000000000000000002',
      'rules-test',
      'content-test',
      'reducer-test'
    )
  $$,
  'identity fixtures can pin a runtime release'
);

select lives_ok(
  $$
    insert into auth.users (id, aud, role, email, created_at, updated_at)
    values
      ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'captain-a@example.test', now(), now()),
      ('10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'participant-a@example.test', now(), now()),
      ('10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'captain-b@example.test', now(), now()),
      ('10000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'shore-a@example.test', now(), now()),
      ('10000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'candidate@example.test', now(), now()),
      ('10000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'deleted@example.test', now(), now())
  $$,
  'Auth users can be created for identity fixtures'
);

select results_eq(
  $$
    select count(*)::bigint
      from ilka.profiles
     where auth_user_id in (
       '10000000-0000-0000-0000-000000000001',
       '10000000-0000-0000-0000-000000000002',
       '10000000-0000-0000-0000-000000000003',
       '10000000-0000-0000-0000-000000000004',
       '10000000-0000-0000-0000-000000000005',
       '10000000-0000-0000-0000-000000000006'
     )
  $$,
  array[6::bigint],
  'Auth creation trigger creates exactly one profile per Auth user'
);

select lives_ok(
  $$delete from auth.users where id = '10000000-0000-0000-0000-000000000006'$$,
  'Auth identity can be removed without deleting historical profile identity'
);

select results_eq(
  $$
    select count(*)::bigint
      from ilka.profiles
     where auth_user_id is null
  $$,
  array[1::bigint],
  'profile remains after Auth user deletion and detaches the Auth identifier'
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
      '30000000-0000-0000-0000-000000000001',
      'identity_test_a',
      'Identity Test A',
      'Europe/Athens',
      '20000000-0000-0000-0000-000000000001',
      profile.id
    from ilka.profiles as profile
    where profile.auth_user_id = '10000000-0000-0000-0000-000000000001';

    insert into ilka.expeditions (
      id,
      expedition_key,
      name,
      timezone,
      runtime_release_id,
      created_by_profile_id
    )
    select
      '30000000-0000-0000-0000-000000000002',
      'identity_test_b',
      'Identity Test B',
      'Europe/Warsaw',
      '20000000-0000-0000-0000-000000000001',
      profile.id
    from ilka.profiles as profile
    where profile.auth_user_id = '10000000-0000-0000-0000-000000000003'
  $$,
  'two isolated Expeditions can be created'
);

select lives_ok(
  $$
    insert into ilka.expedition_members (id, expedition_id, profile_id, role)
    select
      '40000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      profile.id,
      'captain'
    from ilka.profiles as profile
    where profile.auth_user_id = '10000000-0000-0000-0000-000000000001';

    insert into ilka.expedition_members (id, expedition_id, profile_id, role)
    select
      '40000000-0000-0000-0000-000000000002',
      '30000000-0000-0000-0000-000000000001',
      profile.id,
      'participant'
    from ilka.profiles as profile
    where profile.auth_user_id = '10000000-0000-0000-0000-000000000002';

    insert into ilka.expedition_members (id, expedition_id, profile_id, role)
    select
      '40000000-0000-0000-0000-000000000003',
      '30000000-0000-0000-0000-000000000002',
      profile.id,
      'captain'
    from ilka.profiles as profile
    where profile.auth_user_id = '10000000-0000-0000-0000-000000000003';

    insert into ilka.expedition_members (id, expedition_id, profile_id, role)
    select
      '40000000-0000-0000-0000-000000000004',
      '30000000-0000-0000-0000-000000000001',
      profile.id,
      'shore_operator'
    from ilka.profiles as profile
    where profile.auth_user_id = '10000000-0000-0000-0000-000000000004';

    insert into ilka.expedition_members (id, expedition_id, profile_id, role)
    select
      '40000000-0000-0000-0000-000000000005',
      '30000000-0000-0000-0000-000000000001',
      profile.id,
      'participant'
    from ilka.profiles as profile
    where profile.auth_user_id = '10000000-0000-0000-0000-000000000005'
  $$,
  'Expedition-scoped Captain, Participant and Shore memberships can be created'
);

select lives_ok(
  $$
    insert into ilka.participants (
      id,
      participant_key,
      expedition_id,
      expedition_member_id,
      display_name,
      participant_order
    ) values (
      '50000000-0000-0000-0000-000000000001',
      'participant_01',
      '30000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000002',
      'Participant A',
      1
    )
  $$,
  'participant membership can be represented as a domain Participant'
);

select throws_ok(
  $$
    insert into ilka.participants (
      participant_key,
      expedition_id,
      expedition_member_id,
      display_name,
      participant_order
    ) values (
      'captain_as_participant',
      '30000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      'Invalid Captain Participant',
      2
    )
  $$,
  '23514',
  'participant_membership_role_must_be_participant',
  'Captain membership cannot be silently converted into a Participant entity'
);

select throws_ok(
  $$
    insert into ilka.expedition_members (expedition_id, profile_id, role)
    select
      '30000000-0000-0000-0000-000000000001',
      profile.id,
      'captain'
    from ilka.profiles as profile
    where profile.auth_user_id = '10000000-0000-0000-0000-000000000003'
  $$,
  '23505',
  'duplicate key value violates unique constraint "expedition_members_one_active_captain"',
  'an Expedition cannot have two active Captains'
);

set local role service_role;

select results_eq(
  $$
    select membership_role
      from private.resolve_actor_context(
        '10000000-0000-0000-0000-000000000002',
        '30000000-0000-0000-0000-000000000001'
      )
  $$,
  array['participant'::text],
  'active Participant resolves only inside their Expedition'
);

select results_eq(
  $$
    select participant_id
      from private.resolve_actor_context(
        '10000000-0000-0000-0000-000000000002',
        '30000000-0000-0000-0000-000000000001'
      )
  $$,
  array['50000000-0000-0000-0000-000000000001'::uuid],
  'actor context resolves authoritative domain Participant identity'
);

select is_empty(
  $$
    select *
      from private.resolve_actor_context(
        '10000000-0000-0000-0000-000000000002',
        '30000000-0000-0000-0000-000000000002'
      )
  $$,
  'cross-Expedition actor resolution returns no context'
);

select results_eq(
  $$
    select membership_role
      from private.resolve_actor_context(
        '10000000-0000-0000-0000-000000000004',
        '30000000-0000-0000-0000-000000000001'
      )
  $$,
  array['shore_operator'::text],
  'active Shore operator resolves without a Participant entity'
);

reset role;

select lives_ok(
  $$
    update ilka.expedition_members
       set status = 'banned',
           banned_at = now(),
           ban_reason = 'identity gate test'
     where id = '40000000-0000-0000-0000-000000000002';

    update ilka.participants
       set status = 'banned',
           banned_at = now(),
           ban_reason = 'identity gate test'
     where id = '50000000-0000-0000-0000-000000000001'
  $$,
  'Participant and membership can be marked banned without deleting history'
);

set local role service_role;

select is_empty(
  $$
    select *
      from private.resolve_actor_context(
        '10000000-0000-0000-0000-000000000002',
        '30000000-0000-0000-0000-000000000001'
      )
  $$,
  'banned membership cannot resolve active actor context'
);

reset role;

select throws_ok(
  $$
    insert into ilka.invitations (
      expedition_id,
      email_normalized,
      role,
      token_hash,
      invited_by_membership_id,
      expires_at
    ) values (
      '30000000-0000-0000-0000-000000000001',
      'invalid-hash@example.test',
      'participant',
      decode('abcd', 'hex'),
      '40000000-0000-0000-0000-000000000001',
      now() + interval '1 day'
    )
  $$,
  '23514',
  'new row for relation "invitations" violates check constraint "invitations_token_hash_sha256"',
  'raw or non-SHA-256-sized invitation tokens cannot be persisted'
);

select lives_ok(
  $$
    insert into ilka.invitations (
      id,
      expedition_id,
      email_normalized,
      role,
      token_hash,
      invited_by_membership_id,
      expires_at
    ) values (
      '60000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      'invitee@example.test',
      'participant',
      decode(repeat('ab', 32), 'hex'),
      '40000000-0000-0000-0000-000000000001',
      now() + interval '1 day'
    )
  $$,
  'a valid pending invitation stores only a 32-byte hash'
);

select throws_ok(
  $$
    insert into ilka.invitations (
      expedition_id,
      email_normalized,
      role,
      token_hash,
      invited_by_membership_id,
      expires_at
    ) values (
      '30000000-0000-0000-0000-000000000001',
      'invitee@example.test',
      'participant',
      decode(repeat('cd', 32), 'hex'),
      '40000000-0000-0000-0000-000000000001',
      now() + interval '2 days'
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "invitations_one_pending_per_email"',
  'only one pending invitation may exist per Expedition and normalized email'
);

select lives_ok(
  $$
    update ilka.invitations
       set status = 'accepted',
           accepted_at = now(),
           accepted_by_profile_id = (
             select profile.id
               from ilka.profiles as profile
              where profile.auth_user_id = '10000000-0000-0000-0000-000000000004'
           )
     where id = '60000000-0000-0000-0000-000000000001'
  $$,
  'pending invitation can transition once to accepted'
);

select throws_ok(
  $$
    update ilka.invitations
       set token_hash = decode(repeat('ef', 32), 'hex')
     where id = '60000000-0000-0000-0000-000000000001'
  $$,
  '55000',
  'invitation_identity_is_immutable',
  'invitation token hash cannot be replaced'
);

select throws_ok(
  $$
    update ilka.invitations
       set status = 'revoked',
           accepted_at = null,
           accepted_by_profile_id = null,
           revoked_at = now(),
           revoked_by_profile_id = (
             select profile.id
               from ilka.profiles as profile
              where profile.auth_user_id = '10000000-0000-0000-0000-000000000001'
           ),
           revocation_reason = 'terminal transition test'
     where id = '60000000-0000-0000-0000-000000000001'
  $$,
  '55000',
  'invitation_is_terminal',
  'accepted invitation cannot transition again'
);

select * from finish();
rollback;
