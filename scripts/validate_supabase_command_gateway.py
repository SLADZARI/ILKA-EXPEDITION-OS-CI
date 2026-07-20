#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
REQUIRED = (
    "docs/decisions/ADR-014-command-gateway-auth-transport-and-runtime-loading.md",
    "docs/architecture/supabase-command-gateway.md",
    "supabase/contracts/command-gateway-response.schema.json",
    "supabase/contracts/command-gateway-error.schema.json",
    "supabase/functions/command-gateway/deno.json",
    "supabase/functions/command-gateway/index.ts",
    "supabase/functions/_shared/command-gateway/auth.ts",
    "supabase/functions/_shared/command-gateway/canonical-json.ts",
    "supabase/functions/_shared/command-gateway/command-contract.generated.ts",
    "supabase/functions/_shared/command-gateway/database.ts",
    "supabase/functions/_shared/command-gateway/handler.ts",
    "supabase/functions/_shared/command-gateway/runtime-registry.ts",
    "supabase/functions/_shared/command-gateway/schema-validation.ts",
    "supabase/functions/_shared/command-gateway/types.ts",
    "supabase/functions/command-gateway/tests/unit/canonical-json.test.ts",
    "supabase/functions/command-gateway/tests/unit/handler.test.ts",
    "supabase/functions/command-gateway/tests/unit/schema-validation.test.ts",
    "supabase/functions/command-gateway/tests/integration/database.test.ts",
    "scripts/generate_supabase_command_gateway_contract.py",
    "deno.lock",
)


def normalize(text: str) -> str:
    return text.lower().replace("`", "")


def require(text: str, values: tuple[str, ...], label: str, errors: list[str]) -> None:
    lowered = normalize(text)
    for value in values:
        if normalize(value) not in lowered:
            errors.append(f"{label}: {value}")


def main() -> int:
    errors: list[str] = []
    for relative in REQUIRED:
        if not (ROOT / relative).is_file():
            errors.append(f"missing command-gateway file: {relative}")
    if errors:
        return report(errors)

    config = (ROOT / "supabase/config.toml").read_text(encoding="utf-8")
    if 'schemas = ["api"]' not in config:
        errors.append("Data API schemas must remain limited to api")
    if re.search(r'schemas\s*=\s*\[[^\]]*"private"', config):
        errors.append("private must not be exposed through the Data API")
    require(config, (
        "[functions.command-gateway]",
        "verify_jwt = true",
    ), "supabase config missing gateway security", errors)

    adr = (ROOT / REQUIRED[0]).read_text(encoding="utf-8")
    require(adr, (
        "Status: Accepted",
        "SUPABASE_DB_URL",
        "SET LOCAL ROLE service_role",
        "Authentication before replay",
        "actor_id and actor_role are excluded",
        "runtime_release_unavailable",
        "Gate 5 intentionally registers no production reducer",
        "private remains absent",
    ), "ADR-014 missing decision", errors)

    for relative in (
        "supabase/contracts/command-gateway-response.schema.json",
        "supabase/contracts/command-gateway-error.schema.json",
    ):
        schema = json.loads((ROOT / relative).read_text(encoding="utf-8"))
        if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
            errors.append(f"{relative} must use JSON Schema 2020-12")
        if schema.get("additionalProperties") is not False:
            errors.append(f"{relative} must reject undeclared top-level fields")

    index = (ROOT / "supabase/functions/command-gateway/index.ts").read_text(
        encoding="utf-8"
    )
    require(index, (
        "Deno.serve(handler)",
        "SUPABASE_URL",
        "SUPABASE_DB_URL",
        "SUPABASE_ANON_KEY",
        "ILKA_ALLOWED_ORIGINS",
        "commandGatewayRuntimeRegistry",
    ), "gateway entrypoint missing boundary", errors)

    database = (
        ROOT / "supabase/functions/_shared/command-gateway/database.ts"
    ).read_text(encoding="utf-8")
    require(database, (
        "new Pool(connectionString",
        'queryArray("begin")',
        'queryArray("set local role service_role")',
        'queryArray("commit")',
        'queryArray("rollback")',
        "private.resolve_actor_context",
        "private.process_command",
        "ilka.command_receipts",
    ), "gateway database adapter missing boundary", errors)
    if "SUPABASE_SERVICE_ROLE_KEY" in database:
        errors.append("database adapter must not use a service-role REST key")
    if re.search(r"insert\s+into\s+ilka\.(event_log|projection_documents)", database, re.I):
        errors.append("gateway must not directly insert events or projections")

    handler = (
        ROOT / "supabase/functions/_shared/command-gateway/handler.ts"
    ).read_text(encoding="utf-8")
    require(handler, (
        "validateCommand",
        "idempotency_key must equal command_id",
        "commandRequestHash",
        "auth.verify",
        "database.getReceipt",
        "receipt_actor_mismatch",
        "database.loadContext",
        "actor_spoofing_detected",
        "runtime_release_unavailable",
        "resolveActorRole",
        "permission_denied",
        "validatePreparedEvent",
        "validateProcessRequest",
        "database.processCommand",
        "validateProcessResult",
    ), "gateway handler missing behavior", errors)
    auth_at = handler.find("dependencies.auth.verify")
    replay_at = handler.find("dependencies.database.getReceipt")
    membership_at = handler.find("dependencies.database.loadContext")
    if not (0 <= auth_at < replay_at < membership_at):
        errors.append("gateway order must be auth -> replay -> membership")

    canonical = (
        ROOT / "supabase/functions/_shared/command-gateway/canonical-json.ts"
    ).read_text(encoding="utf-8")
    require(canonical, (
        "Object.keys(value).sort()",
        'digest("SHA-256"',
        "issuedAt.toISOString()",
    ), "normalized request hash missing behavior", errors)
    normalized_block = canonical.split("return normalizeValue({", 1)[-1].split("});", 1)[0]
    if "actor_id" in normalized_block or "actor_role" in normalized_block:
        errors.append("normalized request hash must exclude actor claims")

    registry = (
        ROOT / "supabase/functions/_shared/command-gateway/runtime-registry.ts"
    ).read_text(encoding="utf-8")
    require(registry, (
        "release_key === release.release_key",
        "git_commit_sha === release.git_commit_sha",
        "rules_release === release.rules_release",
        "content_release === release.content_release",
        "reducer_version === release.reducer_version",
        "new StaticRuntimeRegistry(",
    ), "runtime registry missing exact pin", errors)

    catalog = yaml.safe_load(
        (ROOT / "engine/command-catalog.yaml").read_text(encoding="utf-8")
    )
    generated = (
        ROOT
        / "supabase/functions/_shared/command-gateway/command-contract.generated.ts"
    ).read_text(encoding="utf-8")
    for command in catalog.get("commands", []):
        command_type = command["command_type"]
        if f'"{command_type}"' not in generated:
            errors.append(f"generated command matrix missing {command_type}")
        for actor in command.get("allowed_actors", []):
            if f'"{actor}"' not in generated:
                errors.append(
                    f"generated command matrix missing actor {actor} for {command_type}"
                )

    workflow = (ROOT / ".github/workflows/validate.yml").read_text(
        encoding="utf-8"
    )
    require(workflow, (
        "denoland/setup-deno@v2",
        "Generate command gateway contract",
        "Format generated command gateway contract",
        "Check command gateway and Engine runtime formatting",
        "Lint command gateway and Engine runtime",
        "Typecheck command gateway and Engine runtime",
        "Run command gateway and Engine runtime unit tests",
        "Run command gateway database integration",
        "Validate Supabase command gateway contract",
    ), "protected CI missing gateway gate", errors)

    architecture = (ROOT / REQUIRED[1]).read_text(encoding="utf-8")
    require(architecture, (
        "original Auth actor",
        "Gate 5 registers no production bundle",
        "Product Captain is never derived from membership/JWT metadata",
        "private.process_command(jsonb)",
        "No integration fixture is deployed",
    ), "gateway architecture missing boundary", errors)

    if errors:
        return report(errors)
    print("SUPABASE COMMAND GATEWAY CONTRACT OK")
    return 0


def report(errors: list[str]) -> int:
    print("SUPABASE COMMAND GATEWAY CONTRACT FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
