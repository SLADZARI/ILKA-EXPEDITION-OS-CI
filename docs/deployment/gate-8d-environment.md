# Gate 8D environment contract

The development `command-gateway` requires these server-side values:

```text
SUPABASE_URL
SUPABASE_DB_URL
SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY
ILKA_DEFAULT_RUNTIME_RELEASE_KEY=expedition_bootstrap_v1
ILKA_ALLOWED_ORIGINS=<reviewed development origins>
```

`ILKA_DEFAULT_RUNTIME_RELEASE_KEY` has no application-code fallback. Missing configuration must fail function initialization rather than silently choose another immutable runtime.

`SUPABASE_DB_URL` and any secret/service-role credentials remain server-only. Publishable keys may be used by authenticated clients but never grant access to internal `ilka` or `private` schemas.
