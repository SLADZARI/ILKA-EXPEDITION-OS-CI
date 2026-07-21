#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REQUIRED = (
    "docs/decisions/ADR-017-expedition-bootstrap-command.md",
    "docs/architecture/expedition-bootstrap.md",
    "supabase/functions/_shared/engine-runtime/expedition-bootstrap-v1.ts",
    "supabase/functions/_shared/command-gateway/bootstrap.ts",
    "supabase/functions/_shared/command-gateway/bootstrap-database.ts",
    "supabase/functions/_shared/command-gateway/bootstrap-schema-validation.ts",
    "supabase/functions/_shared/command-gateway/handler.ts",
    "supabase/functions/command-gateway/index.ts",
    "supabase/functions/command-gateway/tests/unit/expedition-bootstrap-runtime.test.ts",
    "supabase/functions/command-gateway/tests/unit/expedition-bootstrap-executor.test.ts",
    "supabase/functions/command-gateway/tests/unit/expedition-bootstrap-handler.test.ts",
    "supabase/functions/command-gateway/tests/integration/expedition-bootstrap.test.ts",
)


def require(text: str, values: tuple[str, ...], label: str, errors: list[str]) -> None:
    for value in values:
        if value not in text:
            errors.append(f"{label}: {value}")


def main() -> int:
    errors: list[str] = []
    for relative in REQUIRED:
        if not (ROOT / relative).is_file():
            errors.append(f"missing Gate 8C file: {relative}")
    if errors:
        return report(errors)

    runtime = (ROOT / REQUIRED[2]).read_text(encoding="utf-8")
    require(
        runtime,
        (
            "createExpeditionBootstrapRuntime",
            "expedition.created",
            "recovery_days_available",
            "invalid_timezone",
            "duration_days must equal the selected runtime program duration",
            "projection_mutations: []",
        ),
        "bootstrap reducer missing contract",
        errors,
    )
    if "insert into" in runtime.lower() or "private.bootstrap_expedition" in runtime:
        errors.append("pure bootstrap reducer must not contain persistence logic")

    executor = (ROOT / REQUIRED[3]).read_text(encoding="utf-8")
    require(
        executor,
        (
            "loadActiveProfile",
            "profile_actor_mismatch",
            "defaultRuntimeReleaseKey",
            "isExpeditionBootstrapRuntime",
            "validatePreparedEvent",
            "validateProcessRequest",
            "validateBootstrapRequest",
            "bootstrapExpedition",
            "validateProcessResult",
        ),
        "bootstrap executor missing flow",
        errors,
    )

    database = (ROOT / REQUIRED[4]).read_text(encoding="utf-8")
    require(
        database,
        (
            "profile.status = 'active'",
            "ilka.runtime_releases",
            "private.bootstrap_expedition",
            'queryArray("set local role service_role")',
        ),
        "bootstrap database adapter missing boundary",
        errors,
    )
    if re.search(r"insert\s+into\s+ilka\.", database, re.I):
        errors.append("bootstrap adapter must not directly insert domain rows")

    handler = (ROOT / REQUIRED[6]).read_text(encoding="utf-8")
    require(
        handler,
        (
            'command.command_type === "create_expedition"',
            "bootstrapExecutor.execute",
            "bootstrap_persistence_unavailable",
            "dependencies.database.loadContext",
        ),
        "gateway missing pre-membership bootstrap branch",
        errors,
    )
    auth_at = handler.find("dependencies.auth.verify")
    replay_at = handler.find("dependencies.database.getReceipt")
    bootstrap_at = handler.find('command.command_type === "create_expedition"')
    membership_at = handler.find("dependencies.database.loadContext")
    if not (0 <= auth_at < replay_at < bootstrap_at < membership_at):
        errors.append("gateway order must be auth -> replay -> bootstrap -> membership")

    index = (ROOT / REQUIRED[7]).read_text(encoding="utf-8")
    require(
        index,
        (
            "ILKA_DEFAULT_RUNTIME_RELEASE_KEY",
            "PostgresBootstrapDatabase",
            "createExpeditionBootstrapExecutor",
            "createCommandGatewayHandler",
        ),
        "gateway entrypoint missing bootstrap wiring",
        errors,
    )

    adr = (ROOT / REQUIRED[0]).read_text(encoding="utf-8")
    architecture = (ROOT / REQUIRED[1]).read_text(encoding="utf-8")
    require(adr, ("Gate 8C", "Gate 8D"), "ADR-017 missing subgate status", errors)
    require(
        architecture,
        ("Gate 8C", "Gate 8D", "protected merge SHA"),
        "bootstrap architecture missing implementation boundary",
        errors,
    )

    if errors:
        return report(errors)
    print("EXPEDITION BOOTSTRAP EXECUTION OK")
    return 0


def report(errors: list[str]) -> int:
    print("EXPEDITION BOOTSTRAP EXECUTION FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
