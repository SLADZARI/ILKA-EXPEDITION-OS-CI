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
PROCESS_REQUEST = ROOT / "supabase/contracts/private-process-command-request.schema.json"
SETUP_VIEW = ROOT / "app/contracts/expedition-setup-view.schema.json"

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


def process_constraints(schema: dict[str, Any]) -> dict[str, Any]:
    branches = (
        schema.get("properties", {})
        .get("process_command_request", {})
        .get("allOf", [])
    )
    if len(branches) != 2:
        return {}
    if branches[0].get("$ref") != "./private-process-command-request.schema.json":
        return {}
    return branches[1].get("properties", {})


def event_types(events: dict[str, Any]) -> list[str | None]:
    values: list[str | None] = []
    for item in events.get("prefixItems", []):
        branches = item.get("allOf", [])
        if len(branches) != 2:
            values.append(None)
            continue
        values.append(
            branches[1]
            .get("properties", {})
            .get("event_type", {})
            .get("const")
        )
    return values


def validate_projection(command_type: str, constraints: dict[str, Any], errors: list[str]) -> None:
    mutations = constraints.get("projection_mutations", {})
    if mutations.get("minItems") != 1 or mutations.get("maxItems") != 1:
        errors.append(f"{command_type}: exactly one setup projection mutation is required")
        return
    prefix = mutations.get("prefixItems", [])
    if len(prefix) != 1:
        errors.append(f"{command_type}: setup projection prefix contract missing")
        return
    properties = prefix[0].get("properties", {})
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
        errors.append(f"{command_type}: setup projection subject_id must be null")
    if properties.get("projection", {}).get("$ref") != "../../app/contracts/expedition-setup-view.schema.json":
        errors.append(f"{command_type}: projection must reference canonical ExpeditionSetupView")


def main() -> int:
    errors: list[str] = []
    required = [ADR, ARCH, WORKFLOW, CHANGELOG, PROCESS_REQUEST, SETUP_VIEW]
    required.extend(item["path"] for item in CONTRACTS.values())
    for path in required:
        if not path.is_file():
            errors.append(f"missing Gate 9B2A file: {path.relative_to(ROOT)}")
    if errors:
        return report(errors)

    load_schema(PROCESS_REQUEST, errors)
    load_schema(SETUP_VIEW, errors)

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
            errors.append(f"{command_type}: top-level unknown fields must be rejected")
        if set(schema.get("required", [])) != contract["required"]:
            errors.append(f"{command_type}: structural fields drifted")
        if "invitation_token" in json.dumps(schema, sort_keys=True):
            errors.append(f"{command_type}: private request must not carry raw invitation_token")

        constraints = process_constraints(schema)
        if not constraints:
            errors.append(f"{command_type}: private process_command contract reference missing")
            continue
        if constraints.get("status", {}).get("const") != "accepted":
            errors.append(f"{command_type}: wrapper request must be accepted-only")
        if constraints.get("rejection", {}).get("type") != "null":
            errors.append(f"{command_type}: accepted request cannot include rejection")

        command = constraints.get("command", {}).get("properties", {})
        if command.get("command_type", {}).get("const") != command_type:
            errors.append(f"{command_type}: command discriminator drifted")
        if command.get("actor_role", {}).get("const") != contract["actor_role"]:
            errors.append(f"{command_type}: command actor role drifted")
        for field in ("day_number", "stage_id", "day_revision"):
            if command.get(field, {}).get("type") != "null":
                errors.append(f"{command_type}: {field} must be null during setup")

        actor = constraints.get("actor_context", {}).get("properties", {})
        if actor.get("actor_role", {}).get("const") != contract["actor_role"]:
            errors.append(f"{command_type}: actor_context role drifted")

        events = constraints.get("events", {})
        expected_events = contract["events"]
        if events.get("minItems") != len(expected_events) or events.get("maxItems") != len(expected_events):
            errors.append(f"{command_type}: event count drifted")
        if event_types(events) != expected_events:
            errors.append(f"{command_type}: ordered event contract drifted")

        validate_projection(command_type, constraints, errors)

    invite = loaded.get("invite_participant", {})
    invitation = invite.get("properties", {}).get("invitation", {}).get("properties", {})
    if invitation.get("token_hash", {}).get("pattern") != "^[0-9a-f]{64}$":
        errors.append("invite_participant: token_hash must be lowercase SHA-256 hex")
    if invitation.get("role", {}).get("const") != "participant":
        errors.append("invite_participant: role must remain participant")

    accept = loaded.get("accept_invitation", {})
    auth = accept.get("properties", {}).get("auth_identity", {}).get("properties", {})
    if auth.get("email_verified", {}).get("const") is not True:
        errors.append("accept_invitation: verified Auth email is required")
    if auth.get("profile_status", {}).get("const") != "active":
        errors.append("accept_invitation: active Profile is required")
    match = accept.get("properties", {}).get("invitation_match", {}).get("properties", {})
    if match.get("token_hash", {}).get("pattern") != "^[0-9a-f]{64}$":
        errors.append("accept_invitation: token lookup must use lowercase SHA-256 hex")
    if match.get("expected_status", {}).get("const") != "pending":
        errors.append("accept_invitation: invitation must be pending")
    participant = accept.get("properties", {}).get("participant", {}).get("properties", {})
    order = participant.get("participant_order", {})
    if order.get("minimum") != 1 or order.get("maximum") != 5:
        errors.append("accept_invitation: participant_order must remain 1 through 5")

    revoke = loaded.get("revoke_invitation", {})
    transition = revoke.get("properties", {}).get("invitation_transition", {}).get("properties", {})
    if transition.get("expected_status", {}).get("const") != "pending":
        errors.append("revoke_invitation: invitation must be pending")

    adr = ADR.read_text(encoding="utf-8")
    require_text(
        adr,
        (
            "# ADR-019 — Invitation transaction boundaries",
            "Status: Accepted",
            "three private request schemas",
            "private.accept_invitation(jsonb)",
            "no SQL migration, reducer, gateway execution branch or read API",
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
            "before re-reading the invitation",
            "email_verified = true",
            "expected_projection_version",
            "invitation_email_mismatch",
            "Gate 9B2A adds no SQL migration",
        ),
        "Gate 9B2A architecture",
        errors,
    )

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require_text(
        workflow,
        (
            "name: Validate Gate 9B2A contracts",
            "Validate Expedition invitation transaction contract",
            "python scripts/validate_expedition_invitation_transaction_contract.py",
        ),
        "Gate 9B2A workflow",
        errors,
    )

    changelog = CHANGELOG.read_text(encoding="utf-8")
    if "Gate 9B2A invitation transaction contracts" not in changelog:
        errors.append("CHANGELOG missing Gate 9B2A record")

    if errors:
        return report(errors)
    print("EXPEDITION INVITATION TRANSACTION CONTRACT OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
