---
artifactId: ilka.result.mp-dsl-project-kernel-adoption
project: ILKA_EXPEDITION_OS
documentType: RESULT
projectStage: BUILD
gate: G6_VALIDATION
status: DRAFT
version: 0.1
updated: 2026-09-04
owner: Modern Pilgrims
sourceSystem: GIT
authorityType: EVIDENCE
supersedes: null
---

# MP_DSL Project Kernel Adoption

## Goal

Adopt the minimum MP_DSL Project Kernel over the existing ILKA Expedition OS authority without changing approved product, domain, architecture or runtime semantics.

## Owner

Modern Pilgrims

## Status

DRAFT

## Branch

`result/mp-dsl-project-kernel-adoption`

## Acceptance Criteria

- `SLADZARI/ILKA-EXPEDITION-OS-CI` is recorded as canonical repository by explicit Decision.
- `PROJECT.json` exists and routes agents to existing ILKA authority.
- `ARTIFACT_INDEX.json` exists with one current pointer per indexed artifact identity.
- `APPROVED_STATE.json` identifies protected Product, Domain, Architecture and Design authority.
- Existing ILKA ADR/Schema/Engine/source-of-truth hierarchy is preserved.
- ILKA legacy delivery gates remain distinct from MP_DSL engineering gates.
- `PROJECT_INSTRUCTIONS.md` includes the MP_DSL entry sequence and Result/release rules without duplicating existing project instructions.
- Repository CI validates the kernel files and canonical vocabulary used by them.
- Existing application/runtime code is unchanged by this Result.

## Affected Domain

None. This Result must not mutate ILKA domain meaning.

## Affected Systems

- repository root navigation
- project governance metadata
- project instructions
- CI validation
- decision/result documentation

## Evidence

Expected evidence:

- ADR-022
- `PROJECT.json`
- `ARTIFACT_INDEX.json`
- `APPROVED_STATE.json`
- kernel validation script and CI step
- branch diff showing no runtime/product implementation changes
- successful protected CI / validation before merge

## Gate

Current MP_DSL gate: `G6_VALIDATION`.

This Result itself is a governance migration. It does not authorize a production deployment.

## Legacy ILKA delivery context

Current historical ILKA delivery marker: `Gate 9E` / authenticated Day 1 pilot validation.

This marker is preserved for lineage only and must not be interpreted as an MP_DSL engineering gate.
