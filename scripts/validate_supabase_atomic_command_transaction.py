#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
import re
import sys


ADR_PATH = "docs/decisions/ADR-013-atomic-command-transaction-and-projection-document-store.md"
ARCH_PATH = "docs/architecture/supabase-atomic-command-transaction.md"
REQUEST_SCHEMA_PATH = "supabase/contracts/private-process-command-request.schema.json"
RESULT_SCHEMA_PATH = "supabase/contracts/private-process-command-result.schema.json"
MIGRATION_PATH = "supabase/migrations/20260720190000_atomic_command_transaction.sql"
TEST_PATH = "supabase/tests/atomic_command_transaction.test.sql"
TYPES_PATH = "supabase/database.types.ts"

REQUIRED_PATHS = (
    ADR_PATH,
    ARCH_PATH,
    REQUEST_SCHEMA_PATH,
    RESULT_SCHEMA_PATH,
    MIGRATION_PATH,
    TEST_PATH,
    TYPES_PATH,
)


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    errors: list[str] = []

    for relative in REQUIRED_PATHS:
        if not (root / relative).is_file():
            errors.append(f"missing required atomic-command file: {relative}")

    if errors:
        return report(errors)

    adr = (root / ADR_PATH).read_text(encoding="utf-8")
    for expected in (
        "Status: Accepted",
        "private.process_command(p_request jsonb)",
        "command_id lock",
        "Expedition lock",
        "same `command_id`, same Expedition and same `request_hash`",
        "Conflict is an authoritative transaction result but is not persisted",
        "ilka.projection_heads",
        "ilka.projection_documents",
        "operation: upsert",
        "Gate 6",
    ):
        if expected not in adr:
            errors.append(f"ADR-013 missing atomic transaction decision: {expected}")

    for schema_path in (REQUEST_SCHEMA_PATH, RESULT_SCHEMA_PATH):
        try:
            schema = json.loads((root / schema_path).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            errors.append(f"invalid JSON Schema {schema_path}: {exc}")
            continue
        if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
            errors.append(f"{schema_path} must use JSON Schema draft 2020-12")
        if schema.get("additionalProperties") is not False:
            errors.append(f"{schema_path} must reject undeclared top-level fields")

    request_schema = json.loads((root / REQUEST_SCHEMA_PATH).read_text(encoding="utf-8"))
    request_required = set(request_schema.get("required", []))
    for expected in (
        "expedition_id",
        "command",
        "actor_context",
        "request_hash",
        "expected_stream_position",
        "status",
        "events",
        "projection_mutations",
        "runtime_release_id",
        "reducer_version",
    ):
        if expected not in request_required:
            errors.append(f"private process request schema missing required field: {expected}")

    status_enum = request_schema.get("properties", {}).get("status", {}).get("enum", [])
    if status_enum != ["accepted", "rejected"]:
        errors.append("private process request status must be exactly accepted/rejected")

    mutation = (
        request_schema.get("properties", {})
        .get("projection_mutations", {})
        .get("items", {})
    )
    if mutation.get("properties", {}).get("operation", {}).get("const") != "upsert":
        errors.append("projection mutation contract must be upsert-only")

    result_schema = json.loads((root / RESULT_SCHEMA_PATH).read_text(encoding="utf-8"))
    outcome_enum = result_schema.get("properties", {}).get("outcome", {}).get("enum", [])
    if outcome_enum != ["accepted", "rejected", "conflict"]:
        errors.append("private process result outcome must be accepted/rejected/conflict")

    migration = (root / MIGRATION_PATH).read_text(encoding="utf-8")
    lowered = migration.lower()

    for table in ("projection_heads", "projection_documents"):
        if f"create table ilka.{table}" not in lowered:
            errors.append(f"atomic transaction migration missing ilka.{table}")
        if f"alter table ilka.{table} enable row level security" not in lowered:
            errors.append(f"atomic transaction migration must enable RLS on ilka.{table}")
        if f"alter table ilka.{table} force row level security" not in lowered:
            errors.append(f"atomic transaction migration must force RLS on ilka.{table}")
        if f"revoke all on table ilka.{table} from public, anon, authenticated, service_role" not in lowered:
            errors.append(f"atomic transaction migration must revoke direct access to ilka.{table}")

    required_sql = (
        "create or replace function private.process_command(p_request jsonb)",
        "language plpgsql",
        "security definer",
        "set search_path = ''",
        "pg_catalog.pg_advisory_xact_lock",
        "ilka:command:",
        "ilka:expedition:",
        "private.resolve_actor_context",
        "private.assert_expected_stream_position",
        "idempotency_key_reused_with_different_payload",
        "stream_position_conflict",
        "insert into ilka.command_receipts",
        "insert into ilka.event_log",
        "insert into ilka.projection_documents",
        "update ilka.projection_heads",
        "on conflict (expedition_id, projection_key)",
        "grant execute on function private.process_command(jsonb) to service_role",
        "revoke all on function private.build_persisted_command_result(text, boolean, bigint, jsonb) from public, anon, authenticated, service_role",
    )
    for expected in required_sql:
        if expected not in lowered:
            errors.append(f"atomic transaction migration missing contract: {expected}")

    command_lock_at = lowered.find("'ilka:command:'")
    expedition_lock_at = lowered.find("'ilka:expedition:'")
    if command_lock_at < 0 or expedition_lock_at < 0 or command_lock_at >= expedition_lock_at:
        errors.append("atomic transaction must acquire command lock before Expedition lock")

    process_start = lowered.find("create or replace function private.process_command")
    process_end = lowered.find("revoke all on function private.initialize_projection_head", process_start)
    process_body = lowered[process_start:process_end]
    if "commit;" in process_body or "rollback;" in process_body:
        errors.append("private.process_command must not issue application COMMIT or ROLLBACK")

    if re.search(r"grant\s+(insert|update|delete).*ilka\.(projection_heads|projection_documents).*service_role", lowered):
        errors.append("service_role must not receive direct projection write privileges")

    test_sql = (root / TEST_PATH).read_text(encoding="utf-8")
    for expected in (
        "new prepared command returns accepted",
        "all documents from one command share projection and stream versions",
        "exact retry returns the original receipt and original versions",
        "same command_id with another request hash returns an unpersisted rejection",
        "stale expected stream position returns authoritative conflict without persistence",
        "deterministic rejection is stored as an immutable receipt",
        "one command allocates consecutive positions for an ordered event array",
        "projection persistence failure rolls back the complete command transaction",
        "exact replay returns the original receipt even after current membership is banned",
        "new command from banned membership is rejected before persistence",
    ):
        if expected not in test_sql:
            errors.append(f"atomic transaction pgTAP test missing scenario: {expected}")

    architecture = (root / ARCH_PATH).read_text(encoding="utf-8")
    for expected in (
        "one PostgreSQL transaction kernel",
        "Fixed advisory lock order",
        "Conflict is an authoritative transaction result",
        "Gate 6 owns their schema-valid content",
        "SQL remains independent of specific task, card, role, vote, XP or Stage reducers",
        "projection failure rolls back receipt, events and both heads",
    ):
        if expected not in architecture:
            errors.append(f"atomic transaction architecture contract missing boundary: {expected}")

    generated_types = (root / TYPES_PATH).read_text(encoding="utf-8")
    for table in ("projection_heads", "projection_documents"):
        if f"      {table}: {{" not in generated_types:
            errors.append(f"generated database types missing ilka.{table}")
    if "process_command:" not in generated_types:
        errors.append("generated database types missing private.process_command")
    if "build_persisted_command_result:" not in generated_types:
        errors.append("generated database types missing private.build_persisted_command_result")
    if "  public: {" in generated_types:
        errors.append("generated server database types must not include public as an application schema")

    if errors:
        return report(errors)

    print("SUPABASE ATOMIC COMMAND TRANSACTION CONTRACT OK")
    return 0


def report(errors: list[str]) -> int:
    print("SUPABASE ATOMIC COMMAND TRANSACTION CONTRACT FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
