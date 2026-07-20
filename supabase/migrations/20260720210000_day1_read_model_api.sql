begin;

create or replace function api.get_today_view(p_expedition_key text)
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
  v_participant_key text;
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

  if not found or v_actor.participant_id is null then
    raise exception using
      errcode = '42501',
      message = 'active_participant_membership_required';
  end if;

  select participant.participant_key
  into v_participant_key
  from ilka.participants as participant
  where participant.id = v_actor.participant_id
    and participant.expedition_id = v_expedition_id
    and participant.status = 'active';

  if not found then
    raise exception using
      errcode = '42501',
      message = 'active_participant_membership_required';
  end if;

  select document.projection_json
  into v_projection
  from ilka.projection_documents as document
  where document.expedition_id = v_expedition_id
    and document.projection_key = 'today_view:' || v_participant_key
    and document.projection_type = 'today_view'
    and document.subject_id = v_participant_key
    and document.schema_id = 'https://ilka.local/schemas/today-view.schema.json'
    and document.schema_version = '1';

  return v_projection;
end;
$$;

create or replace function api.get_captain_day_view(p_expedition_key text)
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
    and document.projection_key = 'captain_day_view'
    and document.projection_type = 'captain_day_view'
    and document.subject_id is null
    and document.schema_id = 'https://ilka.local/schemas/captain-day-view.schema.json'
    and document.schema_version = '1';

  return v_projection;
end;
$$;

create or replace function api.get_command_receipt(p_command_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid;
  v_expected_stream_position bigint;
begin
  v_auth_user_id := auth.uid();
  if v_auth_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication_required';
  end if;

  select case
    when receipt.status = 'accepted'
      then receipt.stream_position - cardinality(receipt.event_ids)
    else receipt.stream_position
  end
  into v_expected_stream_position
  from ilka.command_receipts as receipt
  where receipt.command_id = p_command_id
    and receipt.actor_auth_user_id = v_auth_user_id;

  if not found then
    return null;
  end if;

  return private.build_persisted_command_result(
    p_command_id,
    true,
    v_expected_stream_position,
    '[]'::jsonb
  );
end;
$$;

comment on function api.get_today_view(text) is 'Returns the authenticated active Participant authoritative TodayView for an Expedition key.';
comment on function api.get_captain_day_view(text) is 'Returns the authoritative CaptainDayView only to the active Captain membership.';
comment on function api.get_command_receipt(text) is 'Returns an immutable command result only to the original authenticated command actor.';

revoke all on function api.get_today_view(text) from public, anon, authenticated, service_role;
revoke all on function api.get_captain_day_view(text) from public, anon, authenticated, service_role;
revoke all on function api.get_command_receipt(text) from public, anon, authenticated, service_role;

grant execute on function api.get_today_view(text) to authenticated, service_role;
grant execute on function api.get_captain_day_view(text) to authenticated, service_role;
grant execute on function api.get_command_receipt(text) to authenticated, service_role;

commit;
