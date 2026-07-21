begin;

create or replace function api.get_expedition_setup_view(p_expedition_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid;
  v_expedition_id uuid;
  v_actor record;
  v_projection jsonb;
begin
  v_auth_user_id := auth.uid();
  if v_auth_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication_required';
  end if;

  select expedition.id
  into v_expedition_id
  from ilka.expeditions as expedition
  where expedition.expedition_key = p_expedition_key;

  if not found then
    return null;
  end if;

  select resolved.*
  into v_actor
  from private.resolve_actor_context(v_auth_user_id, v_expedition_id) as resolved;

  if not found or v_actor.membership_role <> 'captain' then
    raise exception using
      errcode = '42501',
      message = 'active_captain_membership_required';
  end if;

  select document.projection_json
  into v_projection
  from ilka.projection_documents as document
  where document.expedition_id = v_expedition_id
    and document.projection_key = 'expedition_setup_view'
    and document.projection_type = 'expedition_setup_view'
    and document.subject_id is null
    and document.schema_id = 'https://ilka.local/schemas/expedition-setup-view.schema.json'
    and document.schema_version = '1';

  return v_projection;
end;
$$;

comment on function api.get_expedition_setup_view(text) is
  'Returns the authoritative ExpeditionSetupView only to the active Captain membership; returns null before projection bootstrap.';

revoke all on function api.get_expedition_setup_view(text)
  from public, anon, authenticated, service_role;
grant execute on function api.get_expedition_setup_view(text)
  to authenticated, service_role;

commit;
