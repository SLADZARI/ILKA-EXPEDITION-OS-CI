#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ADR = ROOT / "docs/decisions/ADR-013-atomic-command-transaction-and-projection-document-store.md"
ARCH = ROOT / "docs/architecture/supabase-atomic-command-transaction.md"
REQUEST = ROOT / "supabase/contracts/private-process-command-request.schema.json"
RESULT = ROOT / "supabase/contracts/private-process-command-result.schema.json"
MIGRATION = ROOT / "supabase/migrations/20260720190000_atomic_command_transaction.sql"
TEST = ROOT / "supabase/tests/atomic_command_transaction.test.sql"
TYPES = ROOT / "supabase/database.types.ts"


def require(text: str, values: tuple[str, ...], label: str, errors: list[str]) -> None:
    for value in values:
        if value not in text:
            errors.append(f"{label}: {value}")


def main() -> int:
    errors: list[str] = []
    for path in (ADR, ARCH, REQUEST, RESULT, MIGRATION, TEST, TYPES):
        if not path.is_file():
            errors.append(f"missing required atomic-command file: {path.relative_to(ROOT)}")
    if errors:
        return report(errors)

    adr = ADR.read_text(encoding="utf-8")
    require(adr, (
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
    ), "ADR-013 missing decision", errors)

    request = json.loads(REQUEST.read_text(encoding="utf-8"))
    result = json.loads(RESULT.read_text(encoding="utf-8"))
    for path, schema in ((REQUEST, request), (RESULT, result)):
        if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
            errors.append(f"{path.relative_to(ROOT)} must use draft 2020-12")
        if schema.get("additionalProperties") is not False:
            errors.append(f"{path.relative_to(ROOT)} must reject undeclared fields")

    required = set(request.get("required", []))
    for field in (
        "expedition_id", "command", "actor_context", "request_hash",
        "expected_stream_position", "status", "events",
        "projection_mutations", "runtime_release_id", "reducer_version",
    ):
        if field not in required:
            errors.append(f"request schema missing required field: {field}")
    if request["properties"]["status"].get("enum") != ["accepted", "rejected"]:
        errors.append("request status must be accepted/rejected")
    mutation = request["properties"]["projection_mutations"]["items"]
    if mutation["properties"]["operation"].get("const") != "upsert":
        errors.append("projection mutation contract must be upsert-only")
    if result["properties"]["outcome"].get("enum") != ["accepted", "rejected", "conflict"]:
        errors.append("result outcome must be accepted/rejected/conflict")

    sql = MIGRATION.read_text(encoding="utf-8").lower()
    for table in ("projection_heads", "projection_documents"):
        require(sql, (
            f"create table ilka.{table}",
            f"alter table ilka.{table} enable row level security",
            f"alter table ilka.{table} force row level security",
            f"revoke all on table ilka.{table} from public, anon, authenticated, service_role",
        ), f"migration missing {table} contract", errors)
    require(sql, (
        "create or replace function private.process_command(p_request jsonb)",
        "security definer", "set search_path = ''",
        "pg_catalog.pg_advisory_xact_lock", "'ilka:command:'", "'ilka:expedition:'",
        "private.resolve_actor_context", "private.assert_expected_stream_position",
        "idempotency_key_reused_with_different_payload", "stream_position_conflict",
        "insert into ilka.command_receipts", "insert into ilka.event_log",
        "insert into ilka.projection_documents", "update ilka.projection_heads",
        "on conflict (expedition_id, projection_key)",
        "grant execute on function private.process_command(jsonb) to service_role",
        "revoke all on function private.build_persisted_command_result(text, boolean, bigint, jsonb) from public, anon, authenticated, service_role",
    ), "migration missing atomic contract", errors)
    if sql.find("'ilka:command:'") >= sql.find("'ilka:expedition:'"):
        errors.append("command lock must precede Expedition lock")
    start = sql.find("create or replace function private.process_command")
    end = sql.find("revoke all on function private.initialize_projection_head", start)
    body = sql[start:end]
    if "commit;" in body or "rollback;" in body:
        errors.append("process_command must not issue COMMIT or ROLLBACK")
    if re.search(r"grant\s+(insert|update|delete).*ilka\.(projection_heads|projection_documents).*service_role", sql):
        errors.append("service_role must not receive direct projection writes")

    test = TEST.read_text(encoding="utf-8")
    require(test, (
        "new prepared command returns accepted",
        "exact retry returns the original receipt and original versions",
        "same command_id with another request hash returns an unpersisted rejection",
        "stale expected stream position returns authoritative conflict without persistence",
        "deterministic rejection is stored as an immutable receipt",
        "one command allocates consecutive positions for an ordered event array",
        "projection persistence failure rolls back the complete command transaction",
        "exact replay returns the original receipt even after current membership is banned",
        "new command from banned membership is rejected before persistence",
    ), "pgTAP scenario missing", errors)

    architecture = ARCH.read_text(encoding="utf-8").lower()
    require(architecture, (
        "one postgresql transaction kernel",
        "fixed advisory lock order",
        "stale expected stream position returns conflict and writes nothing",
        "gate 6 owns their schema-valid content",
        "engine permissions are not duplicated in sql",
        "projection failure rolls back receipt, events and both heads",
    ), "architecture boundary missing", errors)

    types = TYPES.read_text(encoding="utf-8")
    require(types, (
        "      projection_heads: {",
        "      projection_documents: {",
        "process_command:",
        "build_persisted_command_result:",
    ), "generated types missing", errors)
    if "  public: {" in types:
        errors.append("generated types must not include public application schema")

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
