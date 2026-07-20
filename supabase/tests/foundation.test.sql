begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(25);

select has_schema('ilka', 'internal ilka schema exists');
select has_schema('api', 'explicit api schema exists');
select has_schema('private', 'server-only private schema exists');
select has_table('ilka', 'runtime_releases', 'runtime release registry exists');
select has_pk('ilka', 'runtime_releases', 'runtime release registry has a primary key');
select has_column('ilka', 'runtime_releases', 'id', 'runtime release has id');
select has_column('ilka', 'runtime_releases', 'release_key', 'runtime release has stable release key');
select has_column('ilka', 'runtime_releases', 'git_commit_sha', 'runtime release pins a Git commit');
select has_column('ilka', 'runtime_releases', 'reducer_version', 'runtime release pins reducer version');
select has_trigger('ilka', 'runtime_releases', 'runtime_releases_immutable', 'runtime release registry is protected by an immutability trigger');

select ok(not has_schema_privilege('anon', 'ilka', 'USAGE'), 'anon cannot use ilka schema');
select ok(not has_schema_privilege('authenticated', 'ilka', 'USAGE'), 'authenticated cannot use ilka schema');
select ok(not has_schema_privilege('authenticated', 'private', 'USAGE'), 'authenticated cannot use private schema');
select ok(not has_schema_privilege('anon', 'api', 'USAGE'), 'anon cannot use api schema');
select ok(has_schema_privilege('authenticated', 'api', 'USAGE'), 'authenticated may use the explicit api schema');

select ok(not has_table_privilege('anon', 'ilka.runtime_releases', 'SELECT'), 'anon cannot read runtime releases');
select ok(not has_table_privilege('authenticated', 'ilka.runtime_releases', 'SELECT'), 'authenticated cannot read internal runtime releases directly');
select ok(has_table_privilege('service_role', 'ilka.runtime_releases', 'SELECT'), 'service_role can read runtime releases');
select ok(has_table_privilege('service_role', 'ilka.runtime_releases', 'INSERT'), 'service_role can register runtime releases');
select ok(not has_table_privilege('service_role', 'ilka.runtime_releases', 'UPDATE'), 'service_role cannot update runtime releases');
select ok(not has_table_privilege('service_role', 'ilka.runtime_releases', 'DELETE'), 'service_role cannot delete runtime releases');

select lives_ok(
  $$
    insert into ilka.runtime_releases (
      release_key,
      git_commit_sha,
      rules_release,
      content_release,
      reducer_version
    ) values (
      'foundation_test',
      '0000000000000000000000000000000000000001',
      'rules-test',
      'content-test',
      'reducer-test'
    )
  $$,
  'a valid runtime release can be registered'
);

select throws_ok(
  $$update ilka.runtime_releases set reducer_version = 'mutated' where release_key = 'foundation_test'$$,
  '55000',
  'runtime_releases_are_immutable',
  'runtime releases cannot be updated'
);

select throws_ok(
  $$delete from ilka.runtime_releases where release_key = 'foundation_test'$$,
  '55000',
  'runtime_releases_are_immutable',
  'runtime releases cannot be deleted'
);

select results_eq(
  $$select count(*)::bigint from ilka.runtime_releases where release_key = 'foundation_test'$$,
  array[1::bigint],
  'immutable runtime release remains present after rejected mutations'
);

select * from finish();
rollback;
