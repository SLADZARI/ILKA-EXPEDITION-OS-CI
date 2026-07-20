# Command Gateway development deployment runbook

Target environment: development-only Supabase `VOYAGE`  
Project ID: `rehfxjlyfojkpascjtmb`  
Workflow: `.github/workflows/deploy-command-gateway.yml`

## Preconditions

- Gate 5 implementation is merged to protected `main`.
- Protected `contracts-and-tests` is green for the `main` source being deployed.
- GitHub environment `development` exists.
- `development` or repository secret `SUPABASE_ACCESS_TOKEN` is configured.
- No production or pilot data is present in `VOYAGE`.

## Deployment

Run the GitHub Actions workflow:

```text
Deploy command gateway to development
```

The workflow deliberately checks out `main` regardless of the UI-selected workflow ref. It then runs:

```text
supabase functions deploy command-gateway
  --project-ref rehfxjlyfojkpascjtmb
  --use-api
```

JWT verification remains enabled through `supabase/config.toml`.

## Verification

The workflow fails unless `supabase functions list` contains `command-gateway`.

After deployment, verify separately:

- the function is registered with JWT verification enabled;
- an unauthenticated request is rejected before handler execution;
- no Auth users, Profiles, Expeditions, memberships or Participants were created;
- no command receipts, events or projection documents were created;
- `private` remains absent from Data API schemas;
- no custom production origin is configured until the frontend transport gate defines the authoritative Vercel origin.

## Current runtime boundary

Gate 5 registers no production Engine runtime bundle. Therefore deployment proves authenticated transport and packaging only. A new valid command for an Expedition would return retryable:

```text
runtime_release_unavailable
```

without writing a receipt, event or projection. The first executable command path belongs to the next vertical Engine/read-model gate.

## Rollback

If the deployed package is incorrect, redeploy the last reviewed `main` commit through the same workflow. Do not disable JWT verification and do not expose the `private` schema through PostgREST as a workaround.
