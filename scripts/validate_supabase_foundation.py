#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re
import sys
import tomllib


REQUIRED_PATHS = (
    "docs/decisions/ADR-012-supabase-persistence-command-gateway-and-projection-model.md",
    "docs/architecture/supabase-runtime.md",
    "supabase/config.toml",
    "supabase/migrations/20260720131500_foundation.sql",
    "supabase/tests/foundation.test.sql",
    "supabase/seed.sql",
    "supabase/database.types.ts",
)


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    errors: list[str] = []

    for relative in REQUIRED_PATHS:
        if not (root / relative).is_file():
            errors.append(f"missing required Supabase Foundation file: {relative}")

    if errors:
        return report(errors)

    adr = (root / REQUIRED_PATHS[0]).read_text(encoding="utf-8")
    if "- Status: Accepted" not in adr:
        errors.append("ADR-012 must be Accepted before Supabase Foundation exists")
    if "private.process_command" not in adr:
        errors.append("ADR-012 must define private.process_command as the atomic boundary")

    with (root / "supabase/config.toml").open("rb") as stream:
        config = tomllib.load(stream)

    if config.get("api", {}).get("schemas") != ["api"]:
        errors.append("Supabase Data API must expose only the api schema")
    if config.get("db", {}).get("major_version") != 17:
        errors.append("local Supabase Postgres major_version must be 17")
    if config.get("db", {}).get("seed", {}).get("sql_paths") != ["./seed.sql"]:
        errors.append("Supabase seed path must remain explicit and local")

    migration = (root / "supabase/migrations/20260720131500_foundation.sql").read_text(encoding="utf-8")
    required_sql = (
        "create schema if not exists ilka",
        "create schema if not exists api",
        "create schema if not exists private",
        "create table ilka.runtime_releases",
        "alter table ilka.runtime_releases enable row level security",
        "alter table ilka.runtime_releases force row level security",
        "runtime_releases_immutable",
        "revoke all on schema ilka from public, anon, authenticated",
        "revoke all on schema private from public, anon, authenticated",
    )
    lowered = migration.lower()
    for statement in required_sql:
        if statement.lower() not in lowered:
            errors.append(f"foundation migration missing contract: {statement}")

    if re.search(r"\b(create table|create view)\s+public\.", lowered):
        errors.append("Supabase Foundation must not create application objects in public schema")

    test_sql = (root / "supabase/tests/foundation.test.sql").read_text(encoding="utf-8")
    for expected in ("has_schema('ilka'", "has_schema('api'", "has_schema('private'", "runtime_releases_are_immutable"):
        if expected not in test_sql:
            errors.append(f"foundation pgTAP test missing assertion for {expected}")

    generated_types = (root / "supabase/database.types.ts").read_text(encoding="utf-8")
    for schema_name in ("api", "ilka", "private"):
        if f"  {schema_name}: {{" not in generated_types:
            errors.append(f"generated database types missing {schema_name} schema")
    if "  public: {" in generated_types:
        errors.append("generated server database types must use explicit api, ilka and private schemas")

    if errors:
        return report(errors)

    print("SUPABASE FOUNDATION CONTRACT OK")
    return 0


def report(errors: list[str]) -> int:
    print("SUPABASE FOUNDATION CONTRACT FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
