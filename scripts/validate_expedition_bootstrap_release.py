#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "supabase/functions/_shared/command-gateway/runtime-registry.ts"
MIGRATION = (
    ROOT
    / "supabase/migrations/20260721133000_expedition_bootstrap_runtime_release.sql"
)
PGTAP = ROOT / "supabase/tests/expedition_bootstrap_runtime_release.test.sql"
UNIT = ROOT / "supabase/functions/command-gateway/tests/unit/runtime-registry.test.ts"
INDEX = ROOT / "supabase/functions/command-gateway/index.ts"
ADR = ROOT / "docs/decisions/ADR-017-expedition-bootstrap-command.md"
ARCHITECTURE = ROOT / "docs/architecture/expedition-bootstrap.md"
WORKFLOW = ROOT / ".github/workflows/validate.yml"

REQUIRED = (
    REGISTRY,
    MIGRATION,
    PGTAP,
    UNIT,
    INDEX,
    ADR,
    ARCHITECTURE,
    WORKFLOW,
)

RELEASE_KEY = "expedition_bootstrap_v1"
GIT_SHA = "6175902f32a73a08476111befcb9e9be36e219bf"
RULES_RELEASE = "engine_v8_permissions_v7"
CONTENT_RELEASE = "ilka_mvp_12_day_v5"
REDUCER_VERSION = "expedition_bootstrap_v1"


def require(text: str, values: tuple[str, ...], label: str, errors: list[str]) -> None:
    for value in values:
        if value not in text:
            errors.append(f"{label}: {value}")


def main() -> int:
    errors: list[str] = []
    for path in REQUIRED:
        if not path.is_file():
            errors.append(f"missing Gate 8D file: {path.relative_to(ROOT)}")
    if errors:
        return report(errors)

    engine = yaml.safe_load((ROOT / "engine/game-engine.yaml").read_text(encoding="utf-8"))
    permissions = yaml.safe_load(
        (ROOT / "engine/permissions.yaml").read_text(encoding="utf-8")
    )
    pipeline = yaml.safe_load((ROOT / "engine/pipeline.yaml").read_text(encoding="utf-8"))

    if engine.get("version") != 8:
        errors.append("bootstrap release rules metadata must pin game-engine version 8")
    if engine.get("expedition", {}).get("duration_days") != 12:
        errors.append("game-engine duration must remain 12 days")
    if engine.get("expedition", {}).get("recovery_days_available") != 1:
        errors.append("game-engine must retain one Recovery Day")
    if permissions.get("version") != 7:
        errors.append("bootstrap release rules metadata must pin permissions version 7")
    if "create_expedition" not in permissions.get("roles", {}).get("captain", {}).get(
        "can", []
    ):
        errors.append("Captain permission to create_expedition is missing")
    if pipeline.get("pipeline_id") != "ilka_mvp_12_day" or pipeline.get("version") != 5:
        errors.append("bootstrap content release must pin ilka_mvp_12_day version 5")
    if pipeline.get("duration_days") != 12:
        errors.append("pipeline duration must remain 12 days")
    if pipeline.get("recovery_day", {}).get("max_uses") != 1:
        errors.append("pipeline must retain one floating Recovery Day")

    registry = REGISTRY.read_text(encoding="utf-8")
    require(
        registry,
        (
            "createExpeditionBootstrapRuntime",
            "expeditionBootstrapV1",
            f'release_key: "{RELEASE_KEY}"',
            f'git_commit_sha: "{GIT_SHA}"',
            f'rules_release: "{RULES_RELEASE}"',
            f'content_release: "{CONTENT_RELEASE}"',
            f'reducer_version: "{REDUCER_VERSION}"',
            "duration_days: 12",
            "recovery_days_available: 1",
            "expeditionBootstrapV1,",
        ),
        "runtime registry missing exact bootstrap release",
        errors,
    )

    migration = MIGRATION.read_text(encoding="utf-8")
    require(
        migration,
        (
            "insert into ilka.runtime_releases",
            RELEASE_KEY,
            GIT_SHA,
            RULES_RELEASE,
            CONTENT_RELEASE,
            REDUCER_VERSION,
        ),
        "bootstrap runtime migration missing exact metadata",
        errors,
    )
    if "on conflict" in migration.lower():
        errors.append("immutable bootstrap release migration must not hide collisions")

    unit = UNIT.read_text(encoding="utf-8")
    require(
        unit,
        (
            "bootstrapRelease",
            "expeditionBootstrapV1",
            GIT_SHA,
            "duration_days: 12",
            "recovery_days_available: 1",
            "assertMetadataMismatchRejected(bootstrapRelease)",
        ),
        "runtime registry tests missing bootstrap release coverage",
        errors,
    )

    pgtap = PGTAP.read_text(encoding="utf-8")
    require(
        pgtap,
        (
            "exactly one Expedition bootstrap runtime release is registered",
            GIT_SHA,
            "bootstrap release cannot be updated",
            "bootstrap release cannot be deleted",
        ),
        "pgTAP missing bootstrap release checks",
        errors,
    )

    index = INDEX.read_text(encoding="utf-8")
    require(
        index,
        ("ILKA_DEFAULT_RUNTIME_RELEASE_KEY", "requiredEnv"),
        "Edge Function must keep server-configured default release selection",
        errors,
    )

    adr = ADR.read_text(encoding="utf-8")
    architecture = ARCHITECTURE.read_text(encoding="utf-8")
    require(
        adr,
        ("Gate 8D", "bootstrap-only", "runtime-composition"),
        "ADR-017 missing Gate 8D release boundary",
        errors,
    )
    require(
        architecture,
        ("Gate 8D", RELEASE_KEY, GIT_SHA, "bootstrap-only", "runtime-composition"),
        "bootstrap architecture missing exact release boundary",
        errors,
    )

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(
        workflow,
        (
            "Validate Expedition bootstrap release",
            "python scripts/validate_expedition_bootstrap_release.py",
        ),
        "protected CI missing Gate 8D validation",
        errors,
    )

    if errors:
        return report(errors)
    print("EXPEDITION BOOTSTRAP RELEASE OK")
    return 0


def report(errors: list[str]) -> int:
    print("EXPEDITION BOOTSTRAP RELEASE FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
