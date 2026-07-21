# Gate 8D development smoke checklist

Target: development-only Supabase project `VOYAGE` (`rehfxjlyfojkpascjtmb`).

## Preconditions

- Gate 8D registration PR is merged into protected `main`.
- Migration `expedition_bootstrap_runtime_release` is applied.
- `command-gateway` is deployed with JWT verification enabled.
- Function secret `ILKA_DEFAULT_RUNTIME_RELEASE_KEY` equals `expedition_bootstrap_v1`.
- The smoke actor is a temporary authenticated active Profile.
- Existing domain counts are recorded before execution.

## Command

Submit one canonical online-only command through the deployed `command-gateway`:

```json
{
  "command_id": "cmd_gate8d_smoke_01",
  "command_type": "create_expedition",
  "issued_at": "<ISO_8601_WITH_TIMEZONE>",
  "actor_id": "<ACTIVE_PROFILE_UUID>",
  "actor_role": "captain",
  "expedition_id": "gate8d_smoke",
  "idempotency_key": "cmd_gate8d_smoke_01",
  "payload": {
    "name": "Gate 8D Smoke Expedition",
    "timezone": "Europe/Warsaw",
    "duration_days": 12,
    "day_boundary_local_time": "06:00"
  }
}
```

Repeat the identical request with the same authenticated actor and body.

## Expected responses

First request:

```text
HTTP 200
outcome = accepted
replayed = false
stream_position = 1
projection_version = 0
one expedition.created event ID
```

Exact retry:

```text
HTTP 200
outcome = accepted
replayed = true
same command receipt and event ID
```

## Database verification

For `expedition_key = gate8d_smoke` verify exactly:

```text
1 draft Expedition
1 active Captain membership
1 stream head at position 1
1 projection head at version 0
1 accepted create_expedition receipt
1 expedition.created event
0 Participants
0 invitations
0 projection documents
```

Verify the Expedition pins `expedition_bootstrap_v1` and the release pins protected SHA `6175902f32a73a08476111befcb9e9be36e219bf`.

## Failure rules

- Do not bypass JWT verification.
- Do not hard-code the default release in application code.
- Do not call `private.bootstrap_expedition(jsonb)` from the browser.
- Do not manually insert Expedition, membership, receipt or event rows.
- Do not reuse the smoke Expedition as pilot data.
- If secret configuration or authenticated invocation is unavailable, record Gate 8D as deployment-blocked rather than weakening the boundary.
