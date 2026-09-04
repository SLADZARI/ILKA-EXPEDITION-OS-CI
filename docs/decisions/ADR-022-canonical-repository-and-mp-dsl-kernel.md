# ADR-022 — Canonical repository and MP_DSL Project Kernel

Status: Accepted
Date: 2026-09-04
Decision owner: Modern Pilgrims

## Context

ILKA Expedition OS currently has two repositories with similar names. `SLADZARI/ILKA-EXPEDITION-OS-CI` contains the active implementation, protected CI, architecture, ADRs, schemas, Engine, frontend and Supabase runtime. `SLADZARI/ILKA-EXPEDITION-OS` is an earlier minimal repository.

The project also predates MP_DSL and therefore lacks the standard Project Kernel entrypoints: `PROJECT.json`, `ARTIFACT_INDEX.json` and `APPROVED_STATE.json`.

## Decision

1. `SLADZARI/ILKA-EXPEDITION-OS-CI` is the canonical repository and implementation authority for ILKA Expedition OS.
2. `SLADZARI/ILKA-EXPEDITION-OS` is legacy/history and must not be used as current implementation authority.
3. MP_DSL is adopted as a navigation, approval, Result and evidence layer over the existing ILKA architecture.
4. Existing ILKA authority remains intact. ADRs, schemas, Engine YAML, stages/cards, app contracts, frontend and Supabase runtime are not duplicated or renamed solely for MP_DSL compliance.
5. Existing ILKA `Gate 9*` terminology is historical delivery sequencing and is not the same concept as MP_DSL engineering gates `G0_SIGNAL` through `G8_CLEANUP`.
6. Current MP_DSL project stage is `BUILD`.
7. Current MP_DSL engineering gate is `G6_VALIDATION` until authenticated Day 1 pilot evidence closes the outstanding live-smoke requirements.

## Authority mapping

Existing ILKA source-of-truth priority remains:

1. accepted ADRs;
2. canonical JSON Schemas;
3. Engine YAML;
4. stages and cards;
5. app contracts and requirements;
6. examples and tests;
7. frontend implementation;
8. Supabase runtime implementation where governed by accepted ADRs.

MP_DSL files point to these authorities; they do not replace them.

## Consequences

- New substantial work starts at `PROJECT.json` and follows the MP_DSL kernel sequence.
- Semantic changes to protected ILKA meaning still require an explicit DECISION/ADR or Change Proposal as appropriate.
- One Result maps to one active integration branch by default.
- Release remains separate from commit, merge and preview.
- The legacy repository should later receive a clear history/deprecation pointer as a cleanup action; that change is outside this repository branch.
