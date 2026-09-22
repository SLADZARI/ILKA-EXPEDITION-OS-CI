# ADR-022 — Canonical repository and WeeklyOS / MP_DSL Project Kernel

Status: Accepted
Date: 2026-09-04
Decision owner: Modern Pilgrims

## Context

ILKA Expedition OS had two repositories with similar names. `SLADZARI/ILKA-EXPEDITION-OS-CI` contains the active implementation, CI, architecture, ADRs, schemas, Engine, frontend and Supabase runtime. `SLADZARI/ILKA-EXPEDITION-OS` is an earlier minimal repository.

The project predates the current WeeklyOS / MP_DSL project-kernel convention and therefore requires the standard `.weekly-os/` navigation and approval layer without replacing existing ILKA semantics.

## Decision

1. `SLADZARI/ILKA-EXPEDITION-OS-CI` is the canonical repository and current implementation authority for ILKA Expedition OS.
2. `SLADZARI/ILKA-EXPEDITION-OS` is legacy/history and must not be used as current implementation authority.
3. WeeklyOS / MP_DSL is adopted as a navigation, approval, Result and evidence layer over the existing ILKA architecture.
4. Existing ILKA authority remains intact. ADRs, schemas, Engine YAML, stages/cards, app contracts, frontend and Supabase runtime are not duplicated or renamed solely for MP_DSL compliance.
5. Existing ILKA `Gate 9*` terminology is project delivery history/context and is not the same concept as MP_DSL engineering gates `G0_SIGNAL` through `G8_CLEANUP`.
6. The harmonization Result is carried through MP_DSL `G6_VALIDATION`; this does not itself determine or change ILKA product-release readiness.
7. Kernel migration does not automatically promote README, ADRs, schemas, Engine, design-system or implementation to project-wide APPROVED PRODUCT / DOMAIN / ARCHITECTURE / DESIGN authority.

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

WeeklyOS / MP_DSL files point to these sources and preserve their existing status; they do not replace or silently re-approve them.

## Project kernel

The standard entry sequence is:

1. `.weekly-os/PROJECT.json`;
2. `.weekly-os/ARTIFACT_INDEX.json`;
3. `.weekly-os/APPROVED_STATE.json`;
4. `.weekly-os/PROJECT.json.readFirst`;
5. explicit authority and current Result;
6. implementation only after those checks.

## Consequences

- New substantial work starts at `.weekly-os/PROJECT.json`.
- Semantic changes to approved ILKA meaning require an explicit DECISION/ADR or Change Proposal as appropriate.
- One Result maps to one active integration branch by default.
- Release remains separate from commit, merge, preview and CI success.
- The legacy repository retains only a history/deprecation pointer to this canonical repository.
