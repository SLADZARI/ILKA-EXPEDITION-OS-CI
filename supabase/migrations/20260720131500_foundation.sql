begin;

create schema if not exists ilka;
create schema if not exists api;
create schema if not exists private;

comment on schema ilka is 'Internal ILKA Expedition OS domain tables and projections.';
comment on schema api is 'Explicit Data API surface for schema-valid read models and approved RPC functions.';
comment on schema private is 'Server-only authorization, transaction, scheduler and maintenance helpers.';

revoke all on schema ilka from public, anon, authenticated;
revoke all on schema api from public, anon, authenticated;
revoke all on schema private from public, anon, authenticated;

grant usage on schema api to authenticated, service_role;
grant usage on schema ilka to service_role;
grant usage on schema private to service_role;

alter default privileges for role postgres in schema ilka revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema ilka revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema ilka revoke all on functions from public, anon, authenticated;

alter default privileges for role postgres in schema api revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema api revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema api revoke all on functions from public, anon, authenticated;

alter default privileges for role postgres in schema private revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema private revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema private revoke all on functions from public, anon, authenticated;

create table ilka.runtime_releases (
  id uuid primary key default gen_random_uuid(),
  release_key text not null unique,
  git_commit_sha text not null unique,
  rules_release text not null,
  content_release text not null,
  reducer_version text not null,
  created_at timestamptz not null default now(),
  constraint runtime_releases_release_key_format
    check (release_key ~ '^[a-z0-9][a-z0-9._-]{0,127}$'),
  constraint runtime_releases_git_commit_sha_format
    check (git_commit_sha ~ '^[0-9a-f]{40}$'),
  constraint runtime_releases_rules_release_nonempty
    check (length(btrim(rules_release)) > 0),
  constraint runtime_releases_content_release_nonempty
    check (length(btrim(content_release)) > 0),
  constraint runtime_releases_reducer_version_nonempty
    check (length(btrim(reducer_version)) > 0)
);

comment on table ilka.runtime_releases is 'Immutable registry that pins canonical rules, content and reducer versions used by Expeditions.';
comment on column ilka.runtime_releases.release_key is 'Stable human-readable release identifier.';
comment on column ilka.runtime_releases.git_commit_sha is 'Exact 40-character Git commit SHA for the runtime package.';

alter table ilka.runtime_releases enable row level security;
alter table ilka.runtime_releases force row level security;

revoke all on table ilka.runtime_releases from public, anon, authenticated;
grant select, insert on table ilka.runtime_releases to service_role;

create or replace function private.reject_runtime_release_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'runtime_releases_are_immutable';
end;
$$;

revoke all on function private.reject_runtime_release_mutation() from public, anon, authenticated;

create trigger runtime_releases_immutable
before update or delete on ilka.runtime_releases
for each row
execute function private.reject_runtime_release_mutation();

commit;
