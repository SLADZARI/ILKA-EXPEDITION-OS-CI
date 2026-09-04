---
artifactId: ilka-expedition-os.result.mp-dsl-project-kernel-adoption
project: ilka-expedition-os
documentType: RESULT
projectStage: BUILD
gate: G6_VALIDATION
status: REVIEW
version: 0.2
updated: 2026-09-04
owner: Modern Pilgrims
sourceSystem: GIT
authorityType: EVIDENCE
supersedes: 0.1
---

# MP | ILKA Expedition OS | RESULT | MP_DSL Project Kernel Adoption | v0.2

## Goal

Harmonize the existing ILKA Expedition OS repository with WeeklyOS / MP_DSL governance without changing product, domain, architecture, design or runtime semantics.

## Owner

Modern Pilgrims

## Status

REVIEW

## Branch

`result/mp-dsl-project-kernel-adoption`

## Acceptance Criteria

- `SLADZARI/ILKA-EXPEDITION-OS-CI` is the explicitly confirmed canonical repository.
- `SLADZARI/ILKA-EXPEDITION-OS` is retained only as HISTORY / legacy pointer.
- WeeklyOS kernel lives under `.weekly-os/` and uses the standard entry sequence: `PROJECT.json → ARTIFACT_INDEX.json → APPROVED_STATE.json`.
- Existing ILKA ADR / schema / engine / stage-card / implementation hierarchy is preserved rather than duplicated.
- Migration does not infer project-wide PRODUCT, DOMAIN, ARCHITECTURE or DESIGN approval from maturity, recency or implementation completeness.
- Existing ILKA `Gate 9*` labels remain lineage/context and are not remapped into MP_DSL `G0-G8` semantics.
- `PROJECT_INSTRUCTIONS.md` routes substantial work through `.weekly-os/` first.
- Repository validation checks kernel structure and canonical-repository identity.
- Application/runtime implementation is unchanged by this Result.
- No production deployment is performed or authorized.

## Affected Domain

None.

## Affected Systems

- repository governance metadata;
- project entry/navigation;
- artifact lineage;
- validation of WeeklyOS kernel files;
- project registration readiness for WeeklyOS.

## Evidence

- user Decision confirming `SLADZARI/ILKA-EXPEDITION-OS-CI` as canonical repository;
- `docs/decisions/ADR-022-canonical-repository-and-mp-dsl-kernel.md`;
- `.weekly-os/PROJECT.json`;
- `.weekly-os/ARTIFACT_INDEX.json`;
- `.weekly-os/APPROVED_STATE.json`;
- `scripts/validate_mp_dsl_kernel.py`;
- PR diff showing no application/runtime feature change;
- repository validation result before merge.

## Boundaries

This Result does not:

- approve or redefine ILKA product/domain/design semantics;
- implement Gate 9E work;
- repair unrelated legacy CI failures;
- mutate Supabase runtime data;
- deploy Vercel or Supabase production changes.

## Legacy ILKA delivery context

Existing project material refers to `Gate 9E` / authenticated Day 1 pilot validation. This remains historical delivery context only.
