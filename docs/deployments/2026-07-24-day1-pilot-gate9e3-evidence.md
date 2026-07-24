# Gate 9E3 development rollout evidence

Status: in progress

This document records the controlled deployment and live-pilot evidence for `day1_pilot_v1` in development project `VOYAGE`.

## Protected source

- repository merge SHA: `f2f88cd39c102dcdf46916dfc782a91f503beaaa`
- runtime implementation SHA: `969d4956a9247aa5f28ba18cc6fe587bd38c20f4`
- release key: `day1_pilot_v1`

## Pre-deployment invariant

The existing `gate8d_smoke` Expedition must remain `draft`, pinned to `expedition_bootstrap_v1`, at stream position `1` and projection version `0`.

## Pending evidence

- reviewed `command-gateway` deployed with JWT verification enabled;
- default runtime environment set to `day1_pilot_v1`;
- trusted system-clock secret configured without exposing its value;
- active function source contains invitations, rotation, Expedition start and Day 1 boundary executors;
- post-deployment `gate8d_smoke` invariant unchanged;
- fresh authenticated 3–5 Participant pilot completed or exact missing environment prerequisites recorded.
