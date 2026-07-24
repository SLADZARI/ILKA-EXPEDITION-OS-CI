#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "supabase/functions/_shared/command-gateway/runtime-registry.ts"
MIGRATION = ROOT / "supabase/migrations/20260724010000_day1_pilot_runtime_release.sql"
PGTAP = ROOT / "supabase/tests/day1_pilot_runtime_release.test.sql"
UNIT = ROOT / "supabase/functions/command-gateway/tests/unit/runtime-registry.test.ts"
COMPOSITE = ROOT / "supabase/functions/_shared/engine-runtime/day1-pilot-v1.ts"
DEPLOY = ROOT / ".github/workflows/deploy-command-gateway.yml"
WORKFLOW = ROOT / ".github/workflows/validate.yml"
ARCHITECTURE = ROOT / "docs/architecture/expedition-setup-and-day1-pilot-runtime.md"
RUNBOOK = ROOT / "docs/deployments/2026-07-24-day1-pilot-gate9e.md"

RELEASE_KEY = "day1_pilot_v1"
GIT_SHA = "969d4956a9247aa5f28ba18cc6fe587bd38c20f4"
RULES_RELEASE = "engine_v10_permissions_v8_roles_v2_rotation_v2"
CONTENT_RELEASE = "ilka_mvp_12_day_v5_onboarding_v3"
REDUCER_VERSION = "day1_pilot_v1"


def require(text: str, values: tuple[str, ...], label: str, errors: list[str]) -> None:
    for value in values:
        if value not in text:
            errors.append(f"{label}: {value}")


def main() -> int:
    errors: list[str] = []
    for path in (REGISTRY, MIGRATION, PGTAP, UNIT, COMPOSITE, DEPLOY, WORKFLOW, ARCHITECTURE, RUNBOOK):
        if not path.is_file():
            errors.append(f"missing Gate 9E2 file: {path.relative_to(ROOT)}")
    if errors:
        return report(errors)

    engine = yaml.safe_load((ROOT / "engine/game-engine.yaml").read_text(encoding="utf-8"))
    permissions = yaml.safe_load((ROOT / "engine/permissions.yaml").read_text(encoding="utf-8"))
    roles = yaml.safe_load((ROOT / "engine/roles-catalog.yaml").read_text(encoding="utf-8"))
    rotation = yaml.safe_load((ROOT / "engine/role-rotation-rules.yaml").read_text(encoding="utf-8"))
    pipeline = yaml.safe_load((ROOT / "engine/pipeline.yaml").read_text(encoding="utf-8"))
    onboarding = yaml.safe_load((ROOT / "stages/01_onboarding.yaml").read_text(encoding="utf-8"))

    if engine.get("version") != 10:
        errors.append("pilot rules metadata requires game-engine version 10")
    if permissions.get("version") != 8:
        errors.append("pilot rules metadata requires permissions version 8")
    if roles.get("version") != 2:
        errors.append("pilot rules metadata requires roles catalog version 2")
    if rotation.get("version") != 2 or rotation.get("rotation", {}).get("rules_version") != 2:
        errors.append("pilot rules metadata requires rotation version 2")
    if pipeline.get("pipeline_id") != "ilka_mvp_12_day" or pipeline.get("version") != 5:
        errors.append("pilot content metadata requires ilka_mvp_12_day version 5")
    if onboarding.get("stage_id") != "onboarding" or onboarding.get("version") != 3:
        errors.append("pilot content metadata requires onboarding version 3")

    registry = REGISTRY.read_text(encoding="utf-8")
    require(registry, (
        "createDay1PilotRuntime",
        "day1PilotV1",
        f'release_key: "{RELEASE_KEY}"',
        f'git_commit_sha: "{GIT_SHA}"',
        f'rules_release: "{RULES_RELEASE}"',
        f'content_release: "{CONTENT_RELEASE}"',
        f'reducer_version: "{REDUCER_VERSION}"',
        "day1PilotV1,",
        "day1CompleteTaskV1,",
        "expeditionBootstrapV1,",
    ), "runtime registry missing exact pilot release", errors)

    migration = MIGRATION.read_text(encoding="utf-8")
    require(migration, (
        "insert into ilka.runtime_releases", RELEASE_KEY, GIT_SHA,
        RULES_RELEASE, CONTENT_RELEASE, REDUCER_VERSION,
    ), "pilot runtime migration missing exact metadata", errors)
    lowered = migration.lower()
    if "on conflict" in lowered:
        errors.append("immutable pilot release migration must not hide collisions")
    if "update ilka.expeditions" in lowered or "runtime_release_id" in lowered:
        errors.append("pilot release migration must not mutate existing Expedition pins")

    unit = UNIT.read_text(encoding="utf-8")
    require(unit, (
        "pilotRelease", "day1PilotV1", GIT_SHA,
        "assertMetadataMismatchRejected(pilotRelease)",
        'first_stage_id, "onboarding"',
    ), "runtime registry tests missing pilot release coverage", errors)

    pgtap = PGTAP.read_text(encoding="utf-8")
    require(pgtap, (
        "exactly one Day 1 pilot runtime release is registered", GIT_SHA,
        "registered Day 1 pilot release cannot be updated",
        "registered Day 1 pilot release cannot be deleted",
    ), "pgTAP missing pilot release checks", errors)

    deploy = DEPLOY.read_text(encoding="utf-8")
    require(deploy, (
        "workflow_dispatch", "ref: main", "SUPABASE_ACCESS_TOKEN",
        "ILKA_SYSTEM_CLOCK_HMAC_SECRET", "ILKA_ALLOWED_ORIGINS",
        "ILKA_DEFAULT_RUNTIME_RELEASE_KEY=day1_pilot_v1",
        "supabase secrets set", "supabase functions deploy command-gateway",
        "--project-ref rehfxjlyfojkpascjtmb",
    ), "development deployment workflow missing Gate 9E2 controls", errors)
    if "--no-verify-jwt" in deploy:
        errors.append("development gateway deployment must not disable JWT verification")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(workflow, (
        "Validate Day 1 pilot release",
        "python scripts/validate_day1_pilot_release.py",
    ), "protected CI missing Gate 9E2 release validation", errors)

    architecture = ARCHITECTURE.read_text(encoding="utf-8")
    runbook = RUNBOOK.read_text(encoding="utf-8")
    for text, label in ((architecture, "pilot architecture"), (runbook, "pilot deployment runbook")):
        require(text, (RELEASE_KEY, GIT_SHA, RULES_RELEASE, CONTENT_RELEASE,
                       "gate8d_smoke", "expedition_bootstrap_v1"), label, errors)

    if errors:
        return report(errors)
    print("DAY 1 PILOT RUNTIME RELEASE OK")
    return 0


def report(errors: list[str]) -> int:
    print("DAY 1 PILOT RUNTIME RELEASE FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
