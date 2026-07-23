begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

select has_function(
  'private',
  'process_day_boundary',
  array['jsonb'],
  'private.process_day_boundary(jsonb) exists'
);

select ok(
  has_function_privilege('service_role', 'private.process_day_boundary(jsonb)', 'EXECUTE'),
  'service_role can execute Day boundary wrapper'
);

select ok(
  not has_function_privilege('authenticated', 'private.process_day_boundary(jsonb)', 'EXECUTE'),
  'authenticated cannot execute private Day boundary wrapper'
);

select ok(
  not has_function_privilege('anon', 'private.process_day_boundary(jsonb)', 'EXECUTE'),
  'anon cannot execute private Day boundary wrapper'
);

select ok(
  (
    select proc.prosecdef
    from pg_proc as proc
    join pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'private'
      and proc.proname = 'process_day_boundary'
      and pg_get_function_identity_arguments(proc.oid) = 'p_request jsonb'
  ),
  'Day boundary wrapper is SECURITY DEFINER'
);

select ok(
  (
    select proc.proconfig @> array['search_path=""']::text[]
    from pg_proc as proc
    join pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'private'
      and proc.proname = 'process_day_boundary'
      and pg_get_function_identity_arguments(proc.oid) = 'p_request jsonb'
  ),
  'Day boundary wrapper has empty search_path'
);

select ok(
  position(
    'private.process_command(v_process_request)'
    in pg_get_functiondef('private.process_day_boundary(jsonb)'::regprocedure)
  ) > 0,
  'Day boundary wrapper delegates immutable persistence to private.process_command'
);

select ok(
  position(
    'insert into ilka.event_log'
    in lower(pg_get_functiondef('private.process_day_boundary(jsonb)'::regprocedure))
  ) = 0,
  'Day boundary wrapper does not insert directly into event_log'
);

select ok(
  position(
    'insert into ilka.projection_documents'
    in lower(pg_get_functiondef('private.process_day_boundary(jsonb)'::regprocedure))
  ) = 0,
  'Day boundary wrapper does not insert directly into projection_documents'
);

select * from finish();
rollback;
