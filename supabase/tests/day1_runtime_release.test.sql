begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

select is(
  (select count(*)::integer from ilka.runtime_releases where release_key = 'day1_complete_task_v1'),
  1,
  'exactly one Day 1 complete_task runtime release is registered'
);

select is(
  (select git_commit_sha from ilka.runtime_releases where release_key = 'day1_complete_task_v1'),
  'edbfc911e9bcfddfb87a4adb6b39d21e1a5f2617',
  'runtime release pins the protected reducer implementation commit'
);

select is(
  (select rules_release from ilka.runtime_releases where release_key = 'day1_complete_task_v1'),
  'engine_v8_permissions_v7_onboarding_v3',
  'runtime release pins the accepted rules release'
);

select is(
  (select content_release from ilka.runtime_releases where release_key = 'day1_complete_task_v1'),
  'day1_content_v1',
  'runtime release pins the Day 1 content release'
);

select is(
  (select reducer_version from ilka.runtime_releases where release_key = 'day1_complete_task_v1'),
  'day1_complete_task_v1',
  'runtime release pins the reducer version'
);

select throws_ok(
  $$
    update ilka.runtime_releases
    set reducer_version = 'mutated'
    where release_key = 'day1_complete_task_v1'
  $$,
  '55000',
  'runtime_releases_are_immutable',
  'registered Day 1 runtime release cannot be updated'
);

select throws_ok(
  $$
    delete from ilka.runtime_releases
    where release_key = 'day1_complete_task_v1'
  $$,
  '55000',
  'runtime_releases_are_immutable',
  'registered Day 1 runtime release cannot be deleted'
);

select * from finish();
rollback;
