#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re
import sys


MIGRATION_PATH = "supabase/migrations/20260720160000_identity_membership.sql"
TEST_PATH = "supabase/tests/identity_membership.test.sql"
DOC_PATH = "docs/architecture/supabase-identity-membership.md"
TYPES_PATH = "supabase/database.types.ts"

REQUIRED_PATHS = (
    "docs/decisions/ADR-012-supabase-persistence-command-gateway-and-projection-model.md",
    DOC_PATH,
    MIGRATION_PATH,
    TEST_PATH,
    TYPES_PATH,
)

REQUIRED_TABLES = (
    "profiles",
    "expeditions",
    "expedition_members",
    "participants",
    "invitations",
)


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    errors: list[str] = []

    for relative in REQUIRED_PATHS:
        if not (root / relative).is_file():
            errors.append(f"missing required identity/membership file: {relative}")

    if errors:
        return report(errors)

    adr = (root / REQUIRED_PATHS[0]).read_text(encoding="utf-8")
    for expected in (
        "- Status: Accepted",
        "auth.users.id",
        "profile_id",
        "expedition_member_id",
        "participant_id",
        "captain`, `participant`, `shore_operator",
        "Invitation tokens are stored hashed",
    ):
        if expected not in adr:
            errors.append(f"ADR-012 missing identity contract: {expected}")

    migration = (root / MIGRATION_PATH).read_text(encoding="utf-8")
    lowered = migration.lower()

    for table in REQUIRED_TABLES:
        if f"create table ilka.{table}" not in lowered:
            errors.append(f"identity migration missing ilka.{table}")
        if f"alter table ilka.{table} enable row level security" not in lowered:
            errors.append(f"identity migration must enable RLS on ilka.{table}")
        if f"alter table ilka.{table} force row level security" not in lowered:
            errors.append(f"identity migration must force RLS on ilka.{table}")
        if f"revoke all on table ilka.{table} from public, anon, authenticated" not in lowered:
            errors.append(f"identity migration must revoke browser access to ilka.{table}")

    required_sql = (
        "references auth.users(id) on delete set null",
        "expedition_members_one_active_captain",
        "participant_membership_role_must_be_participant",
        "octet_length(token_hash) = 32",
        "invitations_one_pending_per_email",
        "invitation_identity_is_immutable",
        "invitation_is_terminal",
        "private.resolve_actor_context",
        "grant execute on function private.resolve_actor_context(uuid, uuid) to service_role",
        "create trigger ilka_profile_on_auth_user_created",
    )
    for statement in required_sql:
        if statement.lower() not in lowered:
            errors.append(f"identity migration missing contract: {statement}")

    if re.search(r"\b(create table|create view)\s+public\.", lowered):
        errors.append("identity gate must not create application objects in public schema")

    if "grant select" in lowered and " to authenticated" in lowered:
        errors.append("identity migration must not grant authenticated direct table reads")

    test_sql = (root / TEST_PATH).read_text(encoding="utf-8")
    for expected in (
        "cross-Expedition actor resolution returns no context",
        "banned membership cannot resolve active actor context",
        "an Expedition cannot have two active Captains",
        "raw or non-SHA-256-sized invitation tokens cannot be persisted",
        "invitation token hash cannot be replaced",
        "accepted invitation cannot transition again",
    ):
        if expected not in test_sql:
            errors.append(f"identity pgTAP test missing scenario: {expected}")

    docs = (root / DOC_PATH).read_text(encoding="utf-8")
    for expected in (
        "Product Captain` is not a membership role",
        "This gate does not create canonical domain events",
        "Identity creation, invitation acceptance, membership changes and bans require server confirmation",
        "remote deployment before reviewed PR and green CI",
    ):
        if expected not in docs:
            errors.append(f"identity architecture contract missing boundary: {expected}")

    generated_types = (root / TYPES_PATH).read_text(encoding="utf-8")
    for table in REQUIRED_TABLES:
        if f"      {table}: {{" not in generated_types:
            errors.append(f"generated database types missing ilka.{table}")
    if "resolve_actor_context" not in generated_types:
        errors.append("generated database types missing private.resolve_actor_context")
    if "  public: {" in generated_types:
        errors.append("generated server database types must not include public as an application schema")

    if errors:
        return report(errors)

    print("SUPABASE IDENTITY MEMBERSHIP CONTRACT OK")
    return 0


def report(errors: list[str]) -> int:
    print("SUPABASE IDENTITY MEMBERSHIP CONTRACT FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
