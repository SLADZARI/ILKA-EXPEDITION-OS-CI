begin;

create table ilka.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  display_name text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_nonempty
    check (display_name is null or length(btrim(display_name)) > 0),
  constraint profiles_status_valid
    check (status in ('active', 'disabled'))
);

create table ilka.expeditions (
  id uuid primary key default gen_random_uuid(),
  expedition_key text not null unique,
  name text not null,
  status text not null default 'draft',
  timezone text not null,
  day_boundary_local_time time without time zone not null default time '06:00',
  duration_days smallint not null default 12,
  recovery_days_available smallint not null default 1,
  runtime_release_id uuid not null references ilka.runtime_releases(id) on delete restrict,
  created_by_profile_id uuid not null references ilka.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expeditions_key_format
    check (expedition_key ~ '^[a-z0-9][a-z0-9_]{0,127}$'),
  constraint expeditions_name_nonempty
    check (length(btrim(name)) > 0),
  constraint expeditions_status_valid
    check (status in ('draft', 'ready', 'active', 'suspended', 'completed', 'cancelled')),
  constraint expeditions_timezone_nonempty
    check (length(btrim(timezone)) > 0),
  constraint expeditions_duration_days_valid
    check (duration_days between 1 and 365),
  constraint expeditions_recovery_days_valid
    check (recovery_days_available between 0 and duration_days)
);

create table ilka.expedition_members (
  id uuid primary key default gen_random_uuid(),
  expedition_id uuid not null references ilka.expeditions(id) on delete restrict,
  profile_id uuid not null references ilka.profiles(id) on delete restrict,
  role text not null,
  status text not null default 'active',
  joined_at timestamptz not null default now(),
  banned_at timestamptz,
  ban_reason text,
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expedition_members_expedition_profile_unique
    unique (expedition_id, profile_id),
  constraint expedition_members_id_expedition_unique
    unique (id, expedition_id),
  constraint expedition_members_role_valid
    check (role in ('captain', 'participant', 'shore_operator')),
  constraint expedition_members_status_valid
    check (status in ('active', 'banned', 'revoked')),
  constraint expedition_members_status_metadata_consistent
    check (
      (
        status = 'active'
        and banned_at is null
        and ban_reason is null
        and revoked_at is null
        and revoke_reason is null
      )
      or (
        status = 'banned'
        and banned_at is not null
        and length(btrim(ban_reason)) > 0
        and revoked_at is null
        and revoke_reason is null
      )
      or (
        status = 'revoked'
        and revoked_at is not null
        and length(btrim(revoke_reason)) > 0
      )
    )
);

create unique index expedition_members_one_active_captain
  on ilka.expedition_members (expedition_id)
  where role = 'captain' and status = 'active';

create index expedition_members_profile_status
  on ilka.expedition_members (profile_id, status);

create table ilka.participants (
  id uuid primary key default gen_random_uuid(),
  participant_key text not null,
  expedition_id uuid not null references ilka.expeditions(id) on delete restrict,
  expedition_member_id uuid not null unique,
  display_name text not null,
  participant_order smallint not null,
  status text not null default 'active',
  banned_at timestamptz,
  ban_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participants_member_expedition_fk
    foreign key (expedition_member_id, expedition_id)
    references ilka.expedition_members(id, expedition_id)
    on delete restrict,
  constraint participants_expedition_key_unique
    unique (expedition_id, participant_key),
  constraint participants_expedition_order_unique
    unique (expedition_id, participant_order),
  constraint participants_key_format
    check (participant_key ~ '^[a-z0-9][a-z0-9_]{0,127}$'),
  constraint participants_display_name_nonempty
    check (length(btrim(display_name)) > 0),
  constraint participants_order_valid
    check (participant_order between 1 and 5),
  constraint participants_status_valid
    check (status in ('active', 'banned')),
  constraint participants_status_metadata_consistent
    check (
      (
        status = 'active'
        and banned_at is null
        and ban_reason is null
      )
      or (
        status = 'banned'
        and banned_at is not null
        and length(btrim(ban_reason)) > 0
      )
    )
);

create index participants_expedition_status
  on ilka.participants (expedition_id, status);

create table ilka.invitations (
  id uuid primary key default gen_random_uuid(),
  expedition_id uuid not null references ilka.expeditions(id) on delete restrict,
  email_normalized text not null,
  role text not null,
  token_hash bytea not null unique,
  status text not null default 'pending',
  invited_by_membership_id uuid not null,
  accepted_by_profile_id uuid references ilka.profiles(id) on delete restrict,
  revoked_by_profile_id uuid references ilka.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text,
  updated_at timestamptz not null default now(),
  constraint invitations_inviter_expedition_fk
    foreign key (invited_by_membership_id, expedition_id)
    references ilka.expedition_members(id, expedition_id)
    on delete restrict,
  constraint invitations_email_normalized
    check (
      length(btrim(email_normalized)) > 0
      and email_normalized = lower(btrim(email_normalized))
    ),
  constraint invitations_role_valid
    check (role in ('captain', 'participant', 'shore_operator')),
  constraint invitations_token_hash_sha256
    check (octet_length(token_hash) = 32),
  constraint invitations_status_valid
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  constraint invitations_expiry_after_creation
    check (expires_at > created_at),
  constraint invitations_status_metadata_consistent
    check (
      (
        status = 'pending'
        and accepted_at is null
        and accepted_by_profile_id is null
        and revoked_at is null
        and revoked_by_profile_id is null
        and revocation_reason is null
      )
      or (
        status = 'accepted'
        and accepted_at is not null
        and accepted_by_profile_id is not null
        and revoked_at is null
        and revoked_by_profile_id is null
        and revocation_reason is null
      )
      or (
        status = 'revoked'
        and accepted_at is null
        and accepted_by_profile_id is null
        and revoked_at is not null
        and revoked_by_profile_id is not null
        and length(btrim(revocation_reason)) > 0
      )
      or (
        status = 'expired'
        and accepted_at is null
        and accepted_by_profile_id is null
        and revoked_at is null
        and revoked_by_profile_id is null
        and revocation_reason is null
      )
    )
);

create unique index invitations_one_pending_per_email
  on ilka.invitations (expedition_id, email_normalized)
  where status = 'pending';

create index invitations_pending_expiry
  on ilka.invitations (expires_at)
  where status = 'pending';

comment on table ilka.profiles is 'Application identity record linked to Supabase Auth while preserving domain history if the Auth user is removed.';
comment on table ilka.expeditions is 'Expedition aggregate identity and runtime-release pin; methodology remains owned by canonical repository configuration.';
comment on table ilka.expedition_members is 'Expedition-scoped authorization membership. Product Captain is intentionally not represented here.';
comment on table ilka.participants is 'Domain Participant linked one-to-one to a participant membership inside one Expedition.';
comment on table ilka.invitations is 'Hashed, expiring invitation records. Raw invitation tokens are never persisted.';

alter table ilka.profiles enable row level security;
alter table ilka.profiles force row level security;
alter table ilka.expeditions enable row level security;
alter table ilka.expeditions force row level security;
alter table ilka.expedition_members enable row level security;
alter table ilka.expedition_members force row level security;
alter table ilka.participants enable row level security;
alter table ilka.participants force row level security;
alter table ilka.invitations enable row level security;
alter table ilka.invitations force row level security;

revoke all on table ilka.profiles from public, anon, authenticated;
revoke all on table ilka.expeditions from public, anon, authenticated;
revoke all on table ilka.expedition_members from public, anon, authenticated;
revoke all on table ilka.participants from public, anon, authenticated;
revoke all on table ilka.invitations from public, anon, authenticated;

grant select, insert, update on table ilka.profiles to service_role;
grant select, insert, update on table ilka.expeditions to service_role;
grant select, insert, update on table ilka.expedition_members to service_role;
grant select, insert, update on table ilka.participants to service_role;
grant select, insert, update on table ilka.invitations to service_role;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into ilka.profiles (auth_user_id)
  values (new.id)
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;

create or replace function private.enforce_participant_membership_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership_role text;
begin
  select member.role
    into membership_role
    from ilka.expedition_members as member
   where member.id = new.expedition_member_id
     and member.expedition_id = new.expedition_id;

  if membership_role is distinct from 'participant' then
    raise exception using
      errcode = '23514',
      message = 'participant_membership_role_must_be_participant';
  end if;

  return new;
end;
$$;

create or replace function private.enforce_invitation_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.expedition_id is distinct from old.expedition_id
     or new.email_normalized is distinct from old.email_normalized
     or new.role is distinct from old.role
     or new.token_hash is distinct from old.token_hash
     or new.invited_by_membership_id is distinct from old.invited_by_membership_id
     or new.created_at is distinct from old.created_at
     or new.expires_at is distinct from old.expires_at then
    raise exception using
      errcode = '55000',
      message = 'invitation_identity_is_immutable';
  end if;

  if old.status <> 'pending' and new is distinct from old then
    raise exception using
      errcode = '55000',
      message = 'invitation_is_terminal';
  end if;

  if old.status = 'pending'
     and new.status not in ('pending', 'accepted', 'revoked', 'expired') then
    raise exception using
      errcode = '23514',
      message = 'invalid_invitation_status_transition';
  end if;

  return new;
end;
$$;

create or replace function private.resolve_actor_context(
  p_auth_user_id uuid,
  p_expedition_id uuid
)
returns table (
  profile_id uuid,
  expedition_member_id uuid,
  participant_id uuid,
  membership_role text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.id,
    member.id,
    participant.id,
    member.role
  from ilka.profiles as profile
  join ilka.expedition_members as member
    on member.profile_id = profile.id
  left join ilka.participants as participant
    on participant.expedition_member_id = member.id
   and participant.expedition_id = member.expedition_id
   and participant.status = 'active'
  where profile.auth_user_id = p_auth_user_id
    and profile.status = 'active'
    and member.expedition_id = p_expedition_id
    and member.status = 'active';
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.handle_auth_user_created() from public, anon, authenticated;
revoke all on function private.enforce_participant_membership_role() from public, anon, authenticated;
revoke all on function private.enforce_invitation_update() from public, anon, authenticated;
revoke all on function private.resolve_actor_context(uuid, uuid) from public, anon, authenticated;
grant execute on function private.resolve_actor_context(uuid, uuid) to service_role;

create trigger profiles_set_updated_at
before update on ilka.profiles
for each row execute function private.set_updated_at();

create trigger expeditions_set_updated_at
before update on ilka.expeditions
for each row execute function private.set_updated_at();

create trigger expedition_members_set_updated_at
before update on ilka.expedition_members
for each row execute function private.set_updated_at();

create trigger participants_set_updated_at
before update on ilka.participants
for each row execute function private.set_updated_at();

create trigger invitations_enforce_update
before update on ilka.invitations
for each row execute function private.enforce_invitation_update();

create trigger invitations_set_updated_at
before update on ilka.invitations
for each row execute function private.set_updated_at();

create trigger participants_enforce_membership_role
before insert or update of expedition_member_id, expedition_id on ilka.participants
for each row execute function private.enforce_participant_membership_role();

create trigger ilka_profile_on_auth_user_created
after insert on auth.users
for each row execute function private.handle_auth_user_created();

insert into ilka.profiles (auth_user_id)
select users.id
from auth.users as users
on conflict (auth_user_id) do nothing;

commit;
