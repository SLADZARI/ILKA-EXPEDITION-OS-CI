begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

select has_function(
  'private',
  'generate_rotation',
  array['jsonb'],
  'private.generate_rotation(jsonb) exists'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.generate_rotation(jsonb)',
    'EXECUTE'
  ),
  'service_role can execute rotation wrapper'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.generate_rotation(jsonb)',
    'EXECUTE'
  ),
  'authenticated cannot execute private rotation wrapper'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.generate_rotation(jsonb)',
    'EXECUTE'
  ),
  'anon cannot execute private rotation wrapper'
);

select ok(
  (
    select proc.prosecdef
    from pg_proc as proc
    join pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'private'
      and proc.proname = 'generate_rotation'
      and pg_get_function_identity_arguments(proc.oid) = 'p_request jsonb'
  ),
  'rotation wrapper is SECURITY DEFINER'
);

select ok(
  (
    select proc.proconfig @> array['search_path=""']::text[]
    from pg_proc as proc
    join pg_namespace as namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'private'
      and proc.proname = 'generate_rotation'
      and pg_get_function_identity_arguments(proc.oid) = 'p_request jsonb'
  ),
  'rotation wrapper has empty search_path'
);

select like(
  pg_get_functiondef('private.generate_rotation(jsonb)'::regprocedure),
  '%private.process_command(v_process_request)%',
  'rotation wrapper delegates immutable persistence to private.process_command'
);

select unlike(
  lower(pg_get_functiondef('private.generate_rotation(jsonb)'::regprocedure)),
  '%insert into ilka.event_log%',
  'rotation wrapper does not insert directly into event_log'
);

select unlike(
  lower(pg_get_functiondef('private.generate_rotation(jsonb)'::regprocedure)),
  '%insert into ilka.projection_documents%',
  'rotation wrapper does not insert directly into projection_documents'
);

select * from finish();
rollback;
