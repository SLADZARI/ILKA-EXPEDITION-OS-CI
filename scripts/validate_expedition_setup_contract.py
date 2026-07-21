#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
ADR = ROOT / "docs/decisions/ADR-018-expedition-setup-and-day1-pilot-runtime.md"
ARCH = ROOT / "docs/architecture/expedition-setup-and-day1-pilot-runtime.md"
SETUP_SCHEMA = ROOT / "app/contracts/expedition-setup-view.schema.json"
COMMANDS = ROOT / "engine/command-catalog.yaml"
EVENTS = ROOT / "engine/event-catalog.yaml"
PERMISSIONS = ROOT / "engine/permissions.yaml"
RUNTIME_REGISTRY = (
    ROOT
    / "supabase/functions/_shared/command-gateway/runtime-registry.ts"
)
WORKFLOW = ROOT / ".github/workflows/validate.yml"
CHANGELOG = ROOT / "CHANGELOG.md"

REQUIRED = (
    ADR,
    ARCH,
    SETUP_SCHEMA,
    COMMANDS,
    EVENTS,
    PERMISSIONS,
    RUNTIME_REGISTRY,
    WORKFLOW,
    CHANGELOG,
)

RESERVED_COMMANDS = {
    "invite_participant",
    "accept_invitation",
    "revoke_invitation",
}

RESERVED_EVENTS = {
    "invitation.created",
    "invitation.accepted",
    "invitation.revoked",
    "expedition.ready",
}


def normalized(value: str) -> str:
    return " ".join(value.replace("`", "").split()).lower()


def require_text(
    text: str,
    needles: tuple[str, ...],
    label: str,
    errors: list[str],
) -> None:
    value = normalized(text)
    for needle in needles:
        if normalized(needle) not in value:
            errors.append(f"{label}: missing {needle}")


def report(errors: list[str]) -> int:
    print("EXPEDITION SETUP CONTRACT FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


def object_properties(schema: dict, key: str) -> dict:
    value = schema.get("properties", {}).get(key, {})
    return value.get("properties", {}) if isinstance(value, dict) else {}


def main() -> int:
    errors: list[str] = []

    for path in REQUIRED:
        if not path.is_file():
            errors.append(f"missing Gate 9A file: {path.relative_to(ROOT)}")
    if errors:
        return report(errors)

    adr = ADR.read_text(encoding="utf-8")
    require_text(
        adr,
        (
            "Status: Accepted",
            "invite_participant",
            "accept_invitation",
            "revoke_invitation",
            "Participant membership is created only by accepted accept_invitation",
            "raw token is never stored in an event, projection, receipt, database column, structured log or error message",
            "draft → ready → active",
            "generate_rotation requires 3–5 active Participants and zero pending invitations",
            "start_expedition is accepted only from ready",
            "process_day_boundary remains system_clock-only",
            "release_key: day1_pilot_v1",
            "Gate 9A accepts the business and interface contract only",
            "no executable command, migration, private transaction, runtime bundle",
        ),
        "ADR-018",
        errors,
    )

    architecture = ARCH.read_text(encoding="utf-8")
    require_text(
        architecture,
        (
            "Existing ilka.invitations remains the invitation aggregate record",
            "ExpeditionSetupView is a new concrete projection document, not a second projection engine",
            "1 active participant membership",
            "2 ordered events",
            "exactly one terminal transition may commit",
            "participant_<uuid_without_hyphens>",
            "invitation_<uuid_without_hyphens>",
            "raw token: never persisted",
            "api.get_expedition_setup_view",
            "no browser-side role, card, task or Definition of Done reducer",
            "Gate 9B synchronizes canonical setup commands/events/permissions/schemas",
        ),
        "Gate 9 architecture",
        errors,
    )

    try:
        schema = json.loads(SETUP_SCHEMA.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.append(f"ExpeditionSetupView schema is invalid JSON: {exc}")
        schema = {}

    if schema.get("$id") != "https://ilka.local/schemas/expedition-setup-view.schema.json":
        errors.append("ExpeditionSetupView schema id drifted")
    if schema.get("additionalProperties") is not False:
        errors.append("ExpeditionSetupView must reject unknown top-level fields")

    required = set(schema.get("required", []))
    expected_required = {
        "expedition_id",
        "expedition_status",
        "team",
        "participants",
        "invitations",
        "rotation",
        "readiness",
        "controls",
        "expected_projection_version",
        "sync_status",
    }
    if required != expected_required:
        errors.append("ExpeditionSetupView required fields drifted")

    team = object_properties(schema, "team")
    if team.get("minimum", {}).get("const") != 3:
        errors.append("ExpeditionSetupView minimum team size must be 3")
    if team.get("maximum", {}).get("const") != 5:
        errors.append("ExpeditionSetupView maximum team size must be 5")

    invitations_schema = schema.get("properties", {}).get("invitations", {})
    invitation_item = invitations_schema.get("items", {})
    invitation_properties = invitation_item.get("properties", {})
    if set(invitation_item.get("required", [])) != {
        "invitation_id",
        "email_hint",
        "role",
        "status",
        "expires_at",
        "accepted_participant_id",
    }:
        errors.append("ExpeditionSetupView invitation item contract drifted")

    forbidden_projection_fields = {
        "email",
        "email_normalized",
        "token",
        "invitation_token",
        "token_hash",
    }
    leaked = forbidden_projection_fields.intersection(invitation_properties)
    if leaked:
        errors.append(
            "ExpeditionSetupView exposes forbidden invitation fields: "
            + ", ".join(sorted(leaked))
        )
    if "email_hint" not in invitation_properties:
        errors.append("ExpeditionSetupView must expose masked email_hint")
    elif invitation_properties["email_hint"].get("pattern") != r"\*":
        errors.append("ExpeditionSetupView email_hint must require masking")

    participant_item = (
        schema.get("properties", {})
        .get("participants", {})
        .get("items", {})
    )
    participant_id_pattern = (
        participant_item.get("properties", {})
        .get("participant_id", {})
        .get("pattern")
    )
    if participant_id_pattern != r"^participant_[a-f0-9]{32}$":
        errors.append("Participant setup identity pattern drifted")

    rotation = object_properties(schema, "rotation")
    if rotation.get("status", {}).get("enum") != [
        "not_generated",
        "generated",
    ]:
        errors.append("Setup rotation status vocabulary drifted")

    controls = set(object_properties(schema, "controls"))
    if controls != {
        "invite_participant",
        "revoke_invitation",
        "generate_rotation",
        "start_expedition",
    }:
        errors.append("ExpeditionSetupView Captain controls drifted")

    command_catalog = yaml.safe_load(COMMANDS.read_text(encoding="utf-8"))
    command_types = {
        item.get("command_type") for item in command_catalog.get("commands", [])
    }
    if "add_participant" not in command_types:
        errors.append("Gate 9A unexpectedly removed legacy add_participant")
    premature_commands = RESERVED_COMMANDS.intersection(command_types)
    if premature_commands:
        errors.append(
            "Gate 9A must not publish executable setup commands before Gate 9B: "
            + ", ".join(sorted(premature_commands))
        )

    event_catalog = yaml.safe_load(EVENTS.read_text(encoding="utf-8"))
    event_types = {
        item.get("event_type") for item in event_catalog.get("events", [])
    }
    premature_events = RESERVED_EVENTS.intersection(event_types)
    if premature_events:
        errors.append(
            "Gate 9A must not publish executable setup events before Gate 9B: "
            + ", ".join(sorted(premature_events))
        )

    permissions = yaml.safe_load(PERMISSIONS.read_text(encoding="utf-8"))
    all_permissions: set[str] = set()
    for role in permissions.get("roles", {}).values():
        all_permissions.update(role.get("can", []))
    premature_permissions = RESERVED_COMMANDS.intersection(all_permissions)
    if premature_permissions:
        errors.append(
            "Gate 9A must not grant unimplemented setup permissions: "
            + ", ".join(sorted(premature_permissions))
        )

    runtime_registry = RUNTIME_REGISTRY.read_text(encoding="utf-8")
    if "day1_pilot_v1" in runtime_registry:
        errors.append("Gate 9A must not register day1_pilot_v1")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    if "Validate Expedition setup contract" not in workflow:
        errors.append("protected CI missing Gate 9A validator")
    if "python scripts/validate_expedition_setup_contract.py" not in workflow:
        errors.append("protected CI does not execute Gate 9A validator")

    changelog = CHANGELOG.read_text(encoding="utf-8")
    require_text(
        changelog,
        (
            "Gate 9A Expedition setup and Day 1 pilot contract",
            "ADR-018",
            "ExpeditionSetupView",
            "no executable command",
        ),
        "CHANGELOG",
        errors,
    )

    if errors:
        return report(errors)

    print("EXPEDITION SETUP CONTRACT OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
