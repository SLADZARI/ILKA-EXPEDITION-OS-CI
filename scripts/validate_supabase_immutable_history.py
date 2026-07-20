#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re
import sys


MIGRATION_PATH = "supabase/migrations/20260720170000_immutable_history.sql"
TEST_PATH = "supabase/tests/immutable_history.test.sql"
DOC_PATH = "docs/architecture/supabase-immutable-history.md"
TYPES_PATH = "supabase/database.types.ts"
EVENT_CATALOG_PATH = "engine/event-catalog.yaml"
ADR_PATH = "docs/decisions/ADR-012-supabase-persistence-command-gateway-and-projection-model.md"

REQUIRED_PATHS = (
    ADR_PATH,
    EVENT_CATALOG_PATH,
    DOC_PATH,
    MIGRATION_PATH,
    TEST_PATH,
    TYPES_PATH,
)

REQUIRED_TABLES = (
    "stream_heads",
    "command_receipts",
    "event_log",
)

REQUIRED_FUNCTIONS = (
    "private.initialize_stream_head",
    "private.check_command_idempotency",
    "private.assert_expected_stream_position",
    "private.validate_command_receipt_insert",
    "private.validate_and_advance_event_stream",
    "private.validate_command_receipt_event_set",
    "private.reject_immutable_history_mutation",
)


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    errors: list[str] = []

    for relative in REQUIRED_PATHS:
        if not (root / relative).is_file():
            errors.append(f"missing required immutable-history file: {relative}")

    if errors:
        return report(errors)

    adr = (root / ADR_PATH).read_text(encoding="utf-8")
    for expected in (
        "append-only `event_log` is authoritative runtime history",
        "correcting history creates a new canonical correcting event",
        "same `command_id` plus the same normalized `request_hash` returns the original receipt",
        "Each Expedition owns one ordered event stream",
        "(expedition_id, stream_position) is unique and gap-free",
        "command receipts, stream heads and append-only event log",
    ):
        if expected not in adr:
            errors.append(f"ADR-012 missing immutable-history contract: {expected}")

    migration = (root / MIGRATION_PATH).read_text(encoding="utf-8")
    lowered = migration.lower()

    for table in REQUIRED_TABLES:
        if f"create table ilka.{table}" not in lowered:
            errors.append(f"immutable-history migration missing ilka.{table}")
        if f"alter table ilka.{table} enable row level security" not in lowered:
            errors.append(f"immutable-history migration must enable RLS on ilka.{table}")
        if f"alter table ilka.{table} force row level security" not in lowered:
            errors.append(f"immutable-history migration must force RLS on ilka.{table}")
        if f"revoke all on table ilka.{table} from public, anon, authenticated" not in lowered:
            errors.append(f"immutable-history migration must revoke browser access to ilka.{table}")

    for function in REQUIRED_FUNCTIONS:
        if function not in lowered:
            errors.append(f"immutable-history migration missing helper: {function}")

    required_sql = (
        "unique (expedition_id, stream_position)",
        "octet_length(request_hash) = 32",
        "idempotency_key_reused_with_different_payload",
        "stream_position_conflict",
        "receipt_stream_position_out_of_sequence",
        "event_stream_position_out_of_sequence",
        "accepted_receipt_event_set_incomplete",
        "correction_target_cross_expedition",
        "event_log_is_append_only",
        "command_receipts_is_append_only",
        "create constraint trigger command_receipts_event_set_complete",
        "before truncate on ilka.event_log",
        "grant execute on function private.check_command_idempotency(text, bytea) to service_role",
        "grant execute on function private.assert_expected_stream_position(uuid, bigint) to service_role",
    )
    for statement in required_sql:
        if statement not in lowered:
            errors.append(f"immutable-history migration missing contract: {statement}")

    if re.search(r"\b(create table|create view)\s+public\.", lowered):
        errors.append("immutable-history gate must not create application objects in public schema")

    for table in REQUIRED_TABLES:
        for privilege in ("insert", "update", "delete"):
            if f"grant {privilege} on table ilka.{table} to service_role" in lowered:
                errors.append(
                    f"service_role must not receive direct {privilege.upper()} on ilka.{table}"
                )

    test_sql = (root / TEST_PATH).read_text(encoding="utf-8")
    for expected in (
        "same command_id and request_hash resolves to replay",
        "same command_id with a different request_hash is rejected",
        "stale expected stream position is detected before persistence",
        "runtime replay order is the committed stream_position order",
        "correcting event preserves the original event unchanged",
        "events cannot be updated",
        "events cannot be deleted",
        "event history cannot be truncated",
        "accepted receipt cannot commit without its complete ordered event set",
        "failed cross-Expedition correction does not advance the stream head",
    ):
        if expected not in test_sql:
            errors.append(f"immutable-history pgTAP test missing scenario: {expected}")

    docs = (root / DOC_PATH).read_text(encoding="utf-8")
    for expected in (
        "stream_position` remains database persistence metadata",
        "event_json.expedition_id",
        "The original event remains unchanged and replayable",
        "Gate 4 must compose these primitives",
        "remote deployment before reviewed PR and green CI",
    ):
        if expected not in docs:
            errors.append(f"immutable-history architecture contract missing boundary: {expected}")

    event_catalog = (root / EVENT_CATALOG_PATH).read_text(encoding="utf-8")
    for expected in (
        "persisted runtime events apply in expedition stream_position order",
        "canonical event fixtures without persistence metadata preserve array order",
        "recorded_at and event_id are not authoritative runtime ordering",
    ):
        if expected not in event_catalog:
            errors.append(f"event catalog replay rules missing stream-order contract: {expected}")
    if "events apply in recorded_at then event_id order" in event_catalog:
        errors.append("event catalog still contains the superseded recorded_at/event_id ordering rule")

    generated_types = (root / TYPES_PATH).read_text(encoding="utf-8")
    for table in REQUIRED_TABLES:
        if f"      {table}: {{" not in generated_types:
            errors.append(f"generated database types missing ilka.{table}")
    for function in (
        "assert_expected_stream_position",
        "check_command_idempotency",
    ):
        if function not in generated_types:
            errors.append(f"generated database types missing private.{function}")
    if "  public: {" in generated_types:
        errors.append("generated server database types must not include public as an application schema")

    if errors:
        return report(errors)

    print("SUPABASE IMMUTABLE HISTORY CONTRACT OK")
    return 0


def report(errors: list[str]) -> int:
    print("SUPABASE IMMUTABLE HISTORY CONTRACT FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
