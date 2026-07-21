#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ADR = ROOT / "docs/decisions/ADR-017-expedition-bootstrap-command.md"
ARCH = ROOT / "docs/architecture/expedition-bootstrap.md"
REQUEST = ROOT / "supabase/contracts/private-bootstrap-expedition-request.schema.json"
MIGRATION = ROOT / "supabase/migrations/20260721103000_expedition_bootstrap_transaction.sql"
TEST = ROOT / "supabase/tests/expedition_bootstrap_transaction.test.sql"
TYPES = ROOT / "supabase/database.types.ts"
WORKFLOW = ROOT / ".github/workflows/validate.yml"


def require(text: str, values: tuple[str, ...], label: str, errors: list[str]) -> None:
    for value in values:
        if value not in text:
            errors.append(f"{label}: {value}")


def main() -> int:
    errors: list[str] = []
    for path in (ADR, ARCH, REQUEST, MIGRATION, TEST, TYPES, WORKFLOW):
        if not path.is_file():
            errors.append(f"missing Gate 8B file: {path.relative_to(ROOT)}")
    if errors:
        return report(errors)

    adr = ADR.read_text(encoding="utf-8")
    require(
        adr,
        (
            "private.bootstrap_expedition(jsonb)",
            "command_id` and `expedition_key",
            "stream_head.current_stream_position = 1",
            "projection_head.current_projection_version = 0",
            "Any failure rolls back",
        ),
        "ADR-017 transaction decision missing",
        errors,
    )

    sql = MIGRATION.read_text(encoding="utf-8").lower()
    require(
        sql,
        (
            "create or replace function private.bootstrap_expedition(p_request jsonb)",
            "security definer",
            "set search_path = ''",
            "'ilka:command:'",
            "'ilka:expedition-key:'",
            "idempotency_key_reused_with_different_payload",
            "expedition_key_already_exists",
            "active_profile_required",
            "runtime_release_unavailable",
            "from pg_catalog.pg_timezone_names",
            "insert into ilka.expeditions",
            "insert into ilka.expedition_members",
            "private.process_command(v_process_request)",
            "bootstrap_process_result_invalid",
            "grant execute on function private.bootstrap_expedition(jsonb) to service_role",
        ),
        "bootstrap migration missing transaction contract",
        errors,
    )
    if sql.find("'ilka:command:'") >= sql.find("'ilka:expedition-key:'"):
        errors.append("bootstrap command lock must precede Expedition-key lock")
    if sql.find("insert into ilka.expeditions") >= sql.find("insert into ilka.expedition_members"):
        errors.append("Expedition must be inserted before Captain membership")
    if sql.find("insert into ilka.expedition_members") >= sql.find("private.process_command(v_process_request)"):
        errors.append("Captain membership must exist before process_command actor resolution")

    start = sql.find("create or replace function private.bootstrap_expedition")
    end = sql.find("comment on function private.bootstrap_expedition", start)
    body = sql[start:end]
    if "commit;" in body or "rollback;" in body:
        errors.append("bootstrap_expedition must not issue COMMIT or ROLLBACK")
    if re.search(r"duration_days\s*=\s*12", body):
        errors.append("bootstrap SQL must not hard-code the 12-day methodology")
    if "insert into ilka.event_log" in body or "insert into ilka.command_receipts" in body:
        errors.append("bootstrap wrapper must delegate receipt/event persistence to process_command")
    if re.search(r"grant\s+execute.*bootstrap_expedition.*(anon|authenticated)", sql):
        errors.append("browser roles must not execute private bootstrap")

    test = TEST.read_text(encoding="utf-8")
    require(
        test,
        (
            "valid bootstrap commits the complete Expedition aggregate atomically",
            "accepted bootstrap advances the new Expedition stream to position 1",
            "accepted bootstrap leaves projection version at 0",
            "bootstrap creates exactly one active Captain membership",
            "bootstrap creates no Participant rows",
            "bootstrap creates no invitations",
            "bootstrap creates no projection documents",
            "exact bootstrap retry returns the persisted result",
            "same command_id with another request hash is rejected without mutation",
            "another command cannot reuse an existing Expedition key",
            "disabled Profile cannot bootstrap an Expedition",
            "invalid IANA timezone is rejected before aggregate creation",
            "missing immutable runtime release is rejected",
            "failure inside private.process_command rolls back aggregate creation",
            "process-command failure rolls back the Captain membership",
        ),
        "Gate 8B pgTAP scenario missing",
        errors,
    )

    architecture = ARCH.read_text(encoding="utf-8").lower()
    require(
        architecture,
        (
            "fixed lock order",
            "existing trigger inserts stream_head(position=0)",
            "call private.process_command(process_command_request)",
            "0 participants",
            "0 invitations",
            "0 projection documents",
        ),
        "bootstrap architecture missing transaction boundary",
        errors,
    )

    types = TYPES.read_text(encoding="utf-8")
    if "bootstrap_expedition:" not in types:
        errors.append("generated database types missing private.bootstrap_expedition")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    if "Validate Expedition bootstrap transaction" not in workflow:
        errors.append("protected CI missing Gate 8B validator")

    if errors:
        return report(errors)
    print("EXPEDITION BOOTSTRAP TRANSACTION OK")
    return 0


def report(errors: list[str]) -> int:
    print("EXPEDITION BOOTSTRAP TRANSACTION FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
