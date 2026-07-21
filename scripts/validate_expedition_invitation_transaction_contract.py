#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator


ROOT = Path(__file__).resolve().parents[1]
ADR = ROOT / "docs/decisions/ADR-019-invitation-transaction-boundaries.md"
ARCH = ROOT / "docs/architecture/expedition-invitation-transactions.md"
WORKFLOW = ROOT / ".github/workflows/validate-gate9b2a.yml"
CHANGELOG = ROOT / "CHANGELOG.md"
PROCESS_REQUEST = ROOT / "supabase/contracts/private-invitation-process-command-request.schema.json"
SETUP_VIEW = ROOT / "app/contracts/expedition-setup-view.schema.json"
PROCESS_REF = "./private-invitation-process-command-request.schema.json"

CONTRACTS: dict[str, dict[str, Any]] = {
    "invite_participant": {
        "path": ROOT / "supabase/contracts/private-invite-participant-request.schema.json",
        "title": "PrivateInviteParticipantRequest",
        "required": {"invitation", "process_command_request"},
        "actor_role": "captain",
        "events": ["invitation.created"],
    },
    "accept_invitation": {
        "path": ROOT / "supabase/contracts/private-accept-invitation-request.schema.json",
        "title": "PrivateAcceptInvitationRequest",
        "required": {
            "auth_identity",
            "invitation_match",
            "participant_membership",
            "participant",
            "process_command_request",
        },
        "actor_role": "participant",
        "events": ["invitation.accepted", "participant.added"],
    },
    "revoke_invitation": {
        "path": ROOT / "supabase/contracts/private-revoke-invitation-request.schema.json",
        "title": "PrivateRevokeInvitationRequest",
        "required": {"invitation_transition", "process_command_request"},
        "actor_role": "captain",
        "events": ["invitation.revoked"],
    },
}


def report(errors: list[str]) -> int:
    print("EXPEDITION INVITATION TRANSACTION CONTRACT FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


def load_schema(path: Path, errors: list[str]) -> dict[str, Any]:
    try:
        schema = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"invalid JSON {path.relative_to(ROOT)}: {exc}")
        return {}
    try:
        Draft202012Validator.check_schema(schema)
    except Exception as exc:
        errors.append(f"invalid JSON Schema {path.relative_to(ROOT)}: {exc}")
    return schema


def require_text(text: str, values: tuple[str, ...], label: str, errors: list[str]) -> None:
    for value in values:
        if value not in text:
            errors.append(f"{label}: missing {value}")


def constraints(schema: dict[str, Any]) -> dict[str, Any]:
    branches = schema.get("properties", {}).get("process_command_request", {}).get("allOf", [])
    if len(branches) != 2 or branches[0].get("$ref") != PROCESS_REF:
        return {}
    return branches[1].get("properties", {})


def event_types(events: dict[str, Any]) -> list[str | None]:
    values: list[str | None] = []
    for item in events.get("prefixItems", []):
        branches = item.get("allOf", [])
        values.append(
            branches[1].get("properties", {}).get("event_type", {}).get("const")
            if len(branches) == 2
            else None
        )
    return values


def validate_projection(command_type: str, value: dict[str, Any], errors: list[str]) -> None:
    mutations = value.get("projection_mutations", {})
    if mutations.get("minItems") != 1 or mutations.get("maxItems") != 1:
        errors.append(f"{command_type}: exactly one setup projection is required")
        return
    prefix = mutations.get("prefixItems", [])
    properties = prefix[0].get("properties", {}) if len(prefix) == 1 else {}
    constants = {
        "operation": "upsert",
        "projection_key": "expedition_setup_view",
        "projection_type": "expedition_setup_view",
        "schema_id": "https://ilka.local/schemas/expedition-setup-view.schema.json",
        "schema_version": "1",
    }
    for key, expected in constants.items():
        if properties.get(key, {}).get("const") != expected:
            errors.append(f"{command_type}: projection {key} drifted")
    if properties.get("subject_id", {}).get("type") != "null":
        errors.append(f"{command_type}: projection subject_id must be null")
    if properties.get("projection", {}).get("$ref") != "../../app/contracts/expedition-setup-view.schema.json":
        errors.append(f"{command_type}: canonical ExpeditionSetupView reference missing")


def main() -> int:
    errors: list[str] = []
    paths = [ADR, ARCH, WORKFLOW, CHANGELOG, PROCESS_REQUEST, SETUP_VIEW]
    paths.extend(contract["path"] for contract in CONTRACTS.values())
    for path in paths:
        if not path.is_file():
            errors.append(f"missing Gate 9B2 contract file: {path.relative_to(ROOT)}")
    if errors:
        return report(errors)

    shared = load_schema(PROCESS_REQUEST, errors)
    load_schema(SETUP_VIEW, errors)
    shared_text = json.dumps(shared, sort_keys=True)
    command = shared.get("properties", {}).get("command", {}).get("properties", {})
    actor = shared.get("properties", {}).get("actor_context", {}).get("properties", {})
    if command.get("payload", {}).get("maxProperties") != 0:
        errors.append("shared invitation process command payload must be empty")
    if actor.get("participant_id", {}).get("type") != "null":
        errors.append("shared invitation process actor must be membership-attributed")
    for forbidden in ("invitation_token", "email_normalized", "token_hash"):
        if forbidden in shared_text:
            errors.append(f"shared invitation process schema contains forbidden secret field: {forbidden}")

    loaded: dict[str, dict[str, Any]] = {}
    for command_type, contract in CONTRACTS.items():
        path: Path = contract["path"]
        schema = load_schema(path, errors)
        loaded[command_type] = schema
        if schema.get("$id") != str(path.relative_to(ROOT)):
            errors.append(f"{command_type}: schema id drifted")
        if schema.get("title") != contract["title"]:
            errors.append(f"{command_type}: schema title drifted")
        if schema.get("additionalProperties") is not False:
            errors.append(f"{command_type}: unknown fields must be rejected")
        if set(schema.get("required", [])) != contract["required"]:
            errors.append(f"{command_type}: structural fields drifted")
        if "invitation_token" in json.dumps(schema, sort_keys=True):
            errors.append(f"{command_type}: private request carries raw invitation token")

        value = constraints(schema)
        if not value:
            errors.append(f"{command_type}: secret-free process contract reference missing")
            continue
        command_props = value.get("command", {}).get("properties", {})
        actor_props = value.get("actor_context", {}).get("properties", {})
        if command_props.get("command_type", {}).get("const") != command_type:
            errors.append(f"{command_type}: command discriminator drifted")
        if command_props.get("actor_role", {}).get("const") != contract["actor_role"]:
            errors.append(f"{command_type}: command actor role drifted")
        if actor_props.get("actor_role", {}).get("const") != contract["actor_role"]:
            errors.append(f"{command_type}: actor context role drifted")
        if actor_props.get("participant_id", {}).get("type") != "null":
            errors.append(f"{command_type}: process actor participant_id must remain null")

        events = value.get("events", {})
        expected_events = contract["events"]
        if events.get("minItems") != len(expected_events) or events.get("maxItems") != len(expected_events):
            errors.append(f"{command_type}: event count drifted")
        if event_types(events) != expected_events:
            errors.append(f"{command_type}: ordered events drifted")
        validate_projection(command_type, value, errors)

    invitation = loaded["invite_participant"].get("properties", {}).get("invitation", {}).get("properties", {})
    if invitation.get("token_hash", {}).get("pattern") != "^[0-9a-f]{64}$":
        errors.append("invite token hash must be lowercase SHA-256 hex")

    accept = loaded["accept_invitation"]
    auth = accept.get("properties", {}).get("auth_identity", {}).get("properties", {})
    if auth.get("email_verified", {}).get("const") is not True:
        errors.append("acceptance requires verified Auth email")
    accept_actor = constraints(accept).get("actor_context", {}).get("properties", {})
    if accept_actor.get("actor_id", {}).get("pattern") != "^member_[a-f0-9]{32}$":
        errors.append("acceptance must use canonical membership actor")

    adr = ADR.read_text(encoding="utf-8")
    require_text(
        adr,
        (
            "# ADR-019 — Invitation transaction boundaries",
            "Status: Accepted",
            "three private request schemas",
            "private.accept_invitation(jsonb)",
            "no SQL migration, reducer, gateway execution branch or read API",
            "participant_id: null",
            "secret-free",
        ),
        "ADR-019",
        errors,
    )

    architecture = ARCH.read_text(encoding="utf-8")
    require_text(
        architecture,
        (
            "private.invite_participant(jsonb)",
            "private.accept_invitation(jsonb)",
            "private.revoke_invitation(jsonb)",
            "advisory transaction lock: ilka:command:<command_id>",
            "advisory transaction lock: ilka:expedition:<expedition_uuid>",
            "invitation row SELECT ... FOR UPDATE",
            "Before reading mutable invitation state",
            "email_verified",
            "expected_projection_version",
            "invitation_email_mismatch",
            "Gate 9B2A adds no SQL migration",
            "participant_id: null",
        ),
        "invitation transaction architecture",
        errors,
    )

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require_text(
        workflow,
        (
            "name: Validate Gate 9B2A contracts",
            "python scripts/validate_expedition_invitation_transaction_contract.py",
        ),
        "Gate 9B2A workflow",
        errors,
    )

    if "Gate 9B2A invitation transaction contracts" not in CHANGELOG.read_text(encoding="utf-8"):
        errors.append("CHANGELOG missing Gate 9B2A record")

    if errors:
        return report(errors)
    print("EXPEDITION INVITATION TRANSACTION CONTRACT OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
