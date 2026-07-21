#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ADR = ROOT / "docs/decisions/ADR-019-invitation-transaction-boundaries.md"
ARCH = ROOT / "docs/architecture/expedition-invitation-transactions.md"
SHARED_SCHEMA = ROOT / "supabase/contracts/private-invitation-process-command-request.schema.json"
INVITE_SCHEMA = ROOT / "supabase/contracts/private-invite-participant-request.schema.json"
ACCEPT_SCHEMA = ROOT / "supabase/contracts/private-accept-invitation-request.schema.json"
REVOKE_SCHEMA = ROOT / "supabase/contracts/private-revoke-invitation-request.schema.json"
INVITE_MIGRATION = ROOT / "supabase/migrations/20260721170000_invite_participant_transaction.sql"
ACCEPT_MIGRATION = ROOT / "supabase/migrations/20260721171000_accept_invitation_transaction.sql"
REVOKE_MIGRATION = ROOT / "supabase/migrations/20260721172000_revoke_invitation_transaction.sql"
READ_MIGRATION = ROOT / "supabase/migrations/20260721173000_expedition_setup_read_api.sql"
PGTAP = ROOT / "supabase/tests/invitation_transactions.test.sql"
API_DOC = ROOT / "app/api/read-models.yaml"
TYPES = ROOT / "supabase/database.types.ts"
WORKFLOW = ROOT / ".github/workflows/validate.yml"
CHANGELOG = ROOT / "CHANGELOG.md"


def report(errors: list[str]) -> int:
    print("EXPEDITION INVITATION PERSISTENCE FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


def require(text: str, values: tuple[str, ...], label: str, errors: list[str]) -> None:
    for value in values:
        if value not in text:
            errors.append(f"{label}: missing {value}")


def function_body(sql: str, name: str) -> str:
    start = sql.find(f"create or replace function {name}")
    if start < 0:
        return ""
    end = sql.find(f"comment on function {name}", start)
    return sql[start:end if end >= 0 else None]


def assert_lock_order(body: str, labels: tuple[str, ...], name: str, errors: list[str]) -> None:
    positions = [body.find(label) for label in labels]
    if any(position < 0 for position in positions):
        errors.append(f"{name}: lock marker missing")
    elif positions != sorted(positions):
        errors.append(f"{name}: lock order drifted")


def main() -> int:
    errors: list[str] = []
    required_paths = (
        ADR,
        ARCH,
        SHARED_SCHEMA,
        INVITE_SCHEMA,
        ACCEPT_SCHEMA,
        REVOKE_SCHEMA,
        INVITE_MIGRATION,
        ACCEPT_MIGRATION,
        REVOKE_MIGRATION,
        READ_MIGRATION,
        PGTAP,
        API_DOC,
        TYPES,
        WORKFLOW,
        CHANGELOG,
    )
    for path in required_paths:
        if not path.is_file():
            errors.append(f"missing Gate 9B2B file: {path.relative_to(ROOT)}")
    if errors:
        return report(errors)

    migrations = {
        "private.invite_participant": INVITE_MIGRATION.read_text(encoding="utf-8").lower(),
        "private.accept_invitation": ACCEPT_MIGRATION.read_text(encoding="utf-8").lower(),
        "private.revoke_invitation": REVOKE_MIGRATION.read_text(encoding="utf-8").lower(),
    }

    for name, sql in migrations.items():
        body = function_body(sql, name)
        require(
            body,
            (
                f"create or replace function {name}(p_request jsonb)",
                "security definer",
                "set search_path = ''",
                "'ilka:command:'",
                "'ilka:expedition:'",
                "private.build_persisted_command_result",
                "idempotency_key_reused_with_different_payload",
                "private.process_command(v_process_request)",
                "version_conflict",
                "expedition_setup_view",
                "invitation_secret_exposure_detected",
            ),
            name,
            errors,
        )
        assert_lock_order(body, ("'ilka:command:'", "'ilka:expedition:'"), name, errors)
        if "commit;" in body or "rollback;" in body:
            errors.append(f"{name}: wrapper must not issue COMMIT or ROLLBACK")
        for forbidden in (
            "insert into ilka.command_receipts",
            "insert into ilka.event_log",
            "insert into ilka.projection_documents",
        ):
            if forbidden in body:
                errors.append(f"{name}: wrapper bypasses private.process_command with {forbidden}")
        if re.search(rf"grant\s+execute.*{re.escape(name.split('.')[1])}.*(anon|authenticated)", sql, re.S):
            errors.append(f"{name}: browser role received private execute permission")
        if f"grant execute on function {name}(jsonb) to service_role" not in sql:
            errors.append(f"{name}: service_role execute grant missing")

    invite = function_body(migrations["private.invite_participant"], "private.invite_participant")
    assert_lock_order(
        invite,
        ("'ilka:command:'", "'ilka:expedition:'", "'ilka:invitation-email:'"),
        "private.invite_participant",
        errors,
    )
    require(
        invite,
        (
            "team_capacity_reached",
            "participant_already_member",
            "pending_invitation_already_exists",
            "insert into ilka.invitations",
        ),
        "private.invite_participant business guards",
        errors,
    )

    accept = function_body(migrations["private.accept_invitation"], "private.accept_invitation")
    require(
        accept,
        (
            "email_confirmed_at is not null",
            "invitation_email_mismatch",
            "participant_order_unavailable",
            "for update",
            "insert into ilka.expedition_members",
            "insert into ilka.participants",
            "accepted_by_profile_id",
            "actor_participant_id') is not null",
        ),
        "private.accept_invitation business guards",
        errors,
    )
    ordered = (
        accept.find("insert into ilka.expedition_members"),
        accept.find("private.process_command(v_process_request)"),
        accept.find("insert into ilka.participants"),
        accept.find("update ilka.invitations"),
    )
    if any(position < 0 for position in ordered) or ordered != tuple(sorted(ordered)):
        errors.append("acceptance order must be membership → process_command → Participant → invitation accepted")
    if "nullif(v_actor ->> 'participant_id', '') is not null" not in accept:
        errors.append("acceptance process actor must require participant_id null")

    revoke = function_body(migrations["private.revoke_invitation"], "private.revoke_invitation")
    require(
        revoke,
        (
            "for update",
            "invitation_not_pending",
            "invitation_expired",
            "revoked_by_profile_id",
            "revocation_reason",
        ),
        "private.revoke_invitation terminal guards",
        errors,
    )

    read_sql = READ_MIGRATION.read_text(encoding="utf-8").lower()
    require(
        read_sql,
        (
            "create or replace function api.get_expedition_setup_view(p_expedition_key text)",
            "security definer",
            "set search_path = ''",
            "auth.uid()",
            "active_captain_membership_required",
            "projection_key = 'expedition_setup_view'",
            "schema_id = 'https://ilka.local/schemas/expedition-setup-view.schema.json'",
            "grant execute on function api.get_expedition_setup_view(text)",
            "to authenticated, service_role",
        ),
        "setup read API",
        errors,
    )
    if re.search(r"grant\s+execute.*get_expedition_setup_view.*anon", read_sql, re.S):
        errors.append("anon must not execute setup read API")

    shared = SHARED_SCHEMA.read_text(encoding="utf-8")
    require(
        shared,
        (
            '"title": "PrivateInvitationProcessCommandRequest"',
            '"maxProperties": 0',
            '"participant_id": {',
            '"type": "null"',
        ),
        "secret-free process schema",
        errors,
    )
    for schema_path in (INVITE_SCHEMA, ACCEPT_SCHEMA, REVOKE_SCHEMA):
        schema = schema_path.read_text(encoding="utf-8")
        if '"$ref": "./private-invitation-process-command-request.schema.json"' not in schema:
            errors.append(f"{schema_path.name}: secret-free process schema reference missing")

    test = PGTAP.read_text(encoding="utf-8")
    require(
        test,
        (
            "valid invite commits invitation, receipt, event and setup projection atomically",
            "exact invite retry returns stored result before structural UUID checks",
            "valid acceptance commits invitation, membership, Participant, receipt, ordered events and setup projection atomically",
            "acceptance event order is invitation.accepted then participant.added",
            "exact acceptance replay ignores regenerated structural UUIDs",
            "acceptance and revocation race has one terminal winner",
            "failure inside private.process_command rolls back invitation creation",
            "stale stream conflict rolls back invitation identity mutation",
            "active Captain receives authoritative ExpeditionSetupView",
            "event contains no full invitation email",
            "projection contains no full invitation email",
        ),
        "Gate 9B2B pgTAP coverage",
        errors,
    )

    api_doc = API_DOC.read_text(encoding="utf-8")
    require(
        api_doc,
        (
            "expedition_setup_schema: ../contracts/expedition-setup-view.schema.json",
            "get_expedition_setup_view:",
            "sql_function: api.get_expedition_setup_view",
            "auth: active_captain_membership",
        ),
        "read-model transport",
        errors,
    )

    types = TYPES.read_text(encoding="utf-8")
    for marker in (
        "get_expedition_setup_view:",
        "invite_participant:",
        "accept_invitation:",
        "revoke_invitation:",
    ):
        if marker not in types:
            errors.append(f"generated database types missing {marker}")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(
        workflow,
        (
            "Validate Expedition invitation persistence",
            "python scripts/validate_expedition_invitation_persistence.py",
        ),
        "protected workflow",
        errors,
    )

    adr = ADR.read_text(encoding="utf-8")
    require(
        adr,
        (
            "membership-attributed",
            "participant_id: null",
            "api.get_expedition_setup_view",
            "Gate 9B2B does not add reducers",
        ),
        "ADR-019 Gate 9B2B decision",
        errors,
    )

    architecture = ARCH.read_text(encoding="utf-8")
    require(
        architecture,
        (
            "membership → process_command → Participant",
            "private-invitation-process-command-request.schema.json",
            "Captain read API",
            "Gate 9B2B does not implement",
        ),
        "Gate 9B2B architecture",
        errors,
    )

    if "Gate 9B2B invitation persistence" not in CHANGELOG.read_text(encoding="utf-8"):
        errors.append("CHANGELOG missing Gate 9B2B record")

    if errors:
        return report(errors)
    print("EXPEDITION INVITATION PERSISTENCE OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
