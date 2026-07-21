begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

select is(
  (select count(*)::integer from ilka.runtime_releases where release_key = 'expedition_bootstrap_v1'),
  1,
  'exactly one Expedition bootstrap runtime release is registered'
);

select is(
  (select git_commit_sha from ilka.runtime_releases where release_key = 'expedition_bootstrap_v1'),
  '6175902f32a73a08476111befcb9e9be36e219bf',
  'bootstrap release pins the protected Gate 8C implementation commit'
);

select is(
  (select rules_release from ilka.runtime_releases where release_key = 'expedition_bootstrap_v1'),
  'engine_v8_permissions_v7',
  'bootstrap release pins the accepted Engine and permissions rules'
);

select is(
  (select content_release from ilka.runtime_releases where release_key = 'expedition_bootstrap_v1'),
  'ilka_mvp_12_day_v5',
  'bootstrap release pins the current 12-day program configuration'
);

select is(
  (select reducer_version from ilka.runtime_releases where release_key = 'expedition_bootstrap_v1'),
  'expedition_bootstrap_v1',
  'bootstrap release pins the reducer version'
);

select throws_ok(
  $$
    update ilka.runtime_releases
    set reducer_version = 'mutated'
    where release_key = 'expedition_bootstrap_v1'
  $$,
  '55000',
  'runtime_releases_are_immutable',
  'bootstrap release cannot be updated'
);

select throws_ok(
  $$
    delete from ilka.runtime_releases
    where release_key = 'expedition_bootstrap_v1'
  $$,
  '55000',
  'runtime_releases_are_immutable',
  'bootstrap release cannot be deleted'
);

select ok(
  not has_table_privilege('authenticated', 'ilka.runtime_releases', 'SELECT'),
  'authenticated browser actors cannot read runtime releases directly'
);

select * from finish();
rollback;
