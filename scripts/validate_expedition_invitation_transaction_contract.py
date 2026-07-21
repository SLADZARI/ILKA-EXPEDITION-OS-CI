#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator


ROOT = Path(__file__).resolve().parents[1]
ADR = ROOT / "docs/decisions/ADR-018-expedition-setup-and-day1-pilot-runtime.md"
ARCH = ROOT / "docs/architecture/expedition-invitation-transactions.md"
WORKFLOW = ROOT / ".github/workflows/validate.yml"
CHANGELOG = ROOT / "CHANGELOG.md"
PROCESS_REQUEST = ROOT / "supabase/contracts/private-process-command-request.schema.json"
SETUP_VIEW = ROOT / "app/contracts/expedition-setup-view.schema.json"

CONTRACTS = {
    "invite_participant": {
        "path": ROOT / "supabase/contracts/private-invite-participant-request.schema.json",
        "title": "PrivateInviteParticipantRequest",
        "required": {"invitation", "process_command_request"},
        "events": ["invitation.created"],
        "actor_role": "captain",
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
        "events": ["invitation.accepted", "participant.added"],
        "actor_role": "participant",
    },
    "revoke_invitation": {
        "path": ROOT / "supabase/contracts/private-revoke-invitation-request.schema.json",
        "title": "PrivateRevokeInvitationRequest",
        "required": {"invitation_transition", "process_command_request"},
        "events": ["invitation.revoked"],
        "actor_role": "captain",
    },
}


def report(errors: list[str]) -> int:
    print("EXPEDITION INVITATION TRANSACTION CONTRACT FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


def load_json(path: Path, errors: list[str]) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"invalid JSON {path.relative_to(ROOT)}: {exc}")
        return {}
    try:
        Draft202012Validator.check_schema(value)
    except Exception as exc:  # jsonschema exposes multiple schema error subclasses.
        errors.append(f"invalid JSON Schema {path.relative_to(ROOT)}: {exc}")
    return value


def process_constraints(schema: dict[str, Any]) -> dict[str, Any]:
    process = schema.get("properties", {}).get("process_command_request", {})
    branches = process.get("allOf", [])
    if len(branches) != 2:
        return {}
    return branches[1].get("properties", {})


def require_text(text: str, values: tuple[str, ...], label: str, errors: list[str]) -> None:
    for value in values:
        if value not in text:
            errors.append(f"{label}: missing {value}")


def main() -> int:
    errors: list[str] = []
    required_paths = [ADR, ARCH, WORKFLOW, CHANGELOG, PROCESS_REQUEST, SETUP_VIEW]
    required_paths.extend(contract["path"] for contract in CONTRACTS.values())
    for path in required_paths:
        if not path.is_file():
            errors.append(f"missing Gate 9B2A file: {path.relative_to(ROOT)}")
    if errors:
        return report(errors)

    load_json(PROCESS_REQUEST, errors)
    load_json(SETUP_VIEW, errors)

    for command_type, contract in CONTRACTS.items():
        path = contract["path"]
        schema = load_json(path, errors)
        expected_id = str(path.relative_to(ROOT))
        if schema.get("$id") != expected_id:
            errors.append(f"{command_type}: schema id must be {expected_id}")
        if schema.get("title") != contract["title"]:
            errors.append(f"{command_type}: schema title drifted")
        if schema.get("additionalProperties") is not False:
            errors.append(f"{command_type}: top-level request must reject unknown fields")
        if set(schema.get("required", [])) != contract["required"]:
            errors.append(f"{command_type}: required structural fields drifted")

        serialized = json.dumps(schema, sort_keys=True)
        if "invitation_token" in serialized:
            errors.append(f"{command_type}: private request must never carry a raw invitation token")

        process = schema.get("properties", {}).get("process_command_request", {})
        all_of = process.get("allOf", [])
        if not all_of or all_of[0].get("$ref") != "./private-process-command-request.schema.json":
            errors.append(f"{command_type}: must delegate receipt/event/projection shape to private process_command")
            continue

        constraints = process_constraints(schema)
        if constraints.get("status", {}).get("const") != "accepted":
            errors.append(f"{command_type}: private wrapper request must be accepted-only")
        if constraints.get("rejection", {}).get("type") != "null":
            errors.append(f"{command_type}: accepted wrapper request cannot contain rejection")

        command = constraints.get("command", {}).get("properties", {})
        if command.get("command_type", {}).get("const") != command_type:
            errors.append(f"{command_type}: canonical command discriminator drifted")
        if command.get("actor_role", {}).get("const") != contract["actor_role"]:
            errors.append(f"{command_type}: authoritative actor role drifted")
        for nullable in ("day_number", "stage_id", "day_revision"):
            if command.get(nullable, {}).get("type") != "null":
                errors.append(f"{command_type}: {nullable} must remain null during setup")

        actor = constraints.get("actor_context", {}).get("properties", {})
        if actor.get("actor_role", {}).get("const") != contract["actor_role"]:
            errors.append(f"{command_type}: actor_context role drifted")

        events = constraints.get("events", {})
        expected_events = contract["events"]
        if events.get("minItems") != len(expected_events) or events.get("maxItems") != len(expected_events):
            errors.append(f"{command_type}: event count drifted")
        actual_events: list[str | None] = []
        for item in events.get("prefixItems", []):
            branches = item.get("allOf", [])
            actual_events.append(
                branches[1]
                .get("properties", {})
                .get("event_type", {})
                .get("const")
                if len(branches) > 1
                else None
            )
        if actual_events != expected_events:
            errors.append(f"{command_type}: ordered event contract drifted: {actual_events}")

        projections = constraints.get("projection_mutations", {})
        if projections.get("minItems") != 1 or projections.get("maxItems") != 1:
            errors.append(f"{command_type}: must upsert exactly one setup projection")
        prefix = projections.get("prefixItems", [])
        projection = prefix[0].get("properties", {}) if len(prefix) == 1 else {}
        expected_projection = {
            "operation": "upsert",
            "projection_key": "expedition_setup_view",
            "projection_type": "expedition_setup_view",
            "schema_id": "https://ilka.local/schemas/expedition-setup-view.schema.json",
            "schema_version": "1",
        }
        for key, value in expected_projection.items():
            if projection.get(key, {}).get("const") != value:
                errors.append(f"{command_type}: projection {key} drifted")
        if projection.get("subject_id", {}).get("type") != "null":
            errors.append(f"{command_type}: setup projection subject_id must be null")
        if projection.get("projection", {}).get("$ref") != "../../app/contracts/expedition-setup-view.schema.json":
            errors.append(f"{command_type}: setup projection must reference the canonical app schema")

    invite = load_json(CONTRACTS["invite_participant"]["path"], errors)
    invitation = invite.get("properties", {}).get("invitation", {}).get("properties", {})
    if invitation.get("token_hash", {}).get("pattern") != "^[0-9a-f]{64}$":
        errors.append("invite_participant: token_hash must be lowercase SHA-256 hex")
    if invitation.get("role", {}).get("const") != "participant":
        errors.append("invite_participant: invitation role must remain participant")

    accept = load_json(CONTRACTS["accept_invitation"]["path"], errors)
    auth = accept.get("properties", {}).get("auth_identity", {}).get("properties", {})
    if auth.get("email_verified", {}).get("const") is not True:
        errors.append("accept_invitation: verified Auth email is required")
    if auth.get("profile_status", {}).get("const") != "active":
        errors.append("accept_invitation: active Profile is required")
    invitation_match = accept.get("properties", {}).get("invitation_match", {}).get("properties", {})
    if invitation_match.get("token_hash", {}).get("pattern") != "^[0-9a-f]{64}$":
        errors.append("accept_invitation: token lookup must use lowercase SHA-256 hex")
    if invitation_match.get("expected_status", {}).get("const") != "pending":
        errors.append("accept_invitation: invitation must be pending")
    participant = accept.get("properties", {}).get("participant", {}).get("properties", {})
    if participant.get("participant_order", {}).get("minimum") != 1 or participant.get("participant_order", {}).get("maximum") != 5:
        errors.append("accept_invitation: participant_order must remain 1 through 5")

    revoke = load_json(CONTRACTS["revoke_invitation"]["path"], errors)
    transition = revoke.get("properties", {}).get("invitation_transition", {}).get("properties", {})
    if transition.get("expected_status", {}).get("const") != "pending":
        errors.append("revoke_invitation: invitation must be pending")

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
            "verify exact replay by `command_id`, request hash and authenticated user before re-reading the invitation",
            "email_verified = true",
            "expected_projection_version",
            "invitation_email_mismatch",
            "Gate 9B2A adds no SQL migration",
        ),
        "Gate 9B2A architecture",
        errors,
    )

    adr = ADR.read_text(encoding="utf-8")
    require_text(
        adr,
        (
            "## Gate 9B2A invitation transaction contracts",
            "three private request schemas",
            "no SQL migration, reducer, gateway execution branch or read API",
        ),
        "ADR-018 Gate 9B2A record",
        errors,
    )

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require_text(
        workflow,
        (
            "Validate Expedition invitation transaction contract",
            "python scripts/validate_expedition_invitation_transaction_contract.py",
        ),
        "protected workflow",
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
