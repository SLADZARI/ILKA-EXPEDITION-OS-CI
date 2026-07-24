begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

select is(
  (select count(*)::integer from ilka.runtime_releases where release_key = 'day1_pilot_v1'),
  1,
  'exactly one Day 1 pilot runtime release is registered'
);

select is(
  (select git_commit_sha from ilka.runtime_releases where release_key = 'day1_pilot_v1'),
  '969d4956a9247aa5f28ba18cc6fe587bd38c20f4',
  'pilot release pins the protected Gate 9E1 implementation commit'
);

select is(
  (select rules_release from ilka.runtime_releases where release_key = 'day1_pilot_v1'),
  'engine_v10_permissions_v8_roles_v2_rotation_v2',
  'pilot release pins the exact Engine, permissions, role and rotation rules'
);

select is(
  (select content_release from ilka.runtime_releases where release_key = 'day1_pilot_v1'),
  'ilka_mvp_12_day_v5_onboarding_v3',
  'pilot release pins the exact pipeline and onboarding content release'
);

select is(
  (select reducer_version from ilka.runtime_releases where release_key = 'day1_pilot_v1'),
  'day1_pilot_v1',
  'pilot release pins the composite reducer version'
);

select throws_ok(
  $$
    update ilka.runtime_releases
    set reducer_version = 'mutated'
    where release_key = 'day1_pilot_v1'
  $$,
  '55000',
  'runtime_releases_are_immutable',
  'registered Day 1 pilot release cannot be updated'
);

select throws_ok(
  $$
    delete from ilka.runtime_releases
    where release_key = 'day1_pilot_v1'
  $$,
  '55000',
  'runtime_releases_are_immutable',
  'registered Day 1 pilot release cannot be deleted'
);

select ok(
  not has_table_privilege('authenticated', 'ilka.runtime_releases', 'SELECT'),
  'authenticated browser actors cannot read pilot runtime metadata directly'
);

select * from finish();
rollback;
