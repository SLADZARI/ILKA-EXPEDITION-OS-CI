#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
ADR = ROOT / "docs/decisions/ADR-017-expedition-bootstrap-command.md"
ARCH = ROOT / "docs/architecture/expedition-bootstrap.md"
COMMANDS = ROOT / "engine/command-catalog.yaml"
EVENTS = ROOT / "engine/event-catalog.yaml"
ENGINE = ROOT / "engine/game-engine.yaml"
PERMISSIONS = ROOT / "engine/permissions.yaml"
API = ROOT / "app/api/commands.yaml"
PRIVATE_REQUEST = ROOT / "supabase/contracts/private-bootstrap-expedition-request.schema.json"
PROCESS_REQUEST = ROOT / "supabase/contracts/private-process-command-request.schema.json"
COMMAND_SCHEMA = ROOT / "schemas/command.schema.json"
EVENT_SCHEMA = ROOT / "engine/event.schema.json"
WORKFLOW = ROOT / ".github/workflows/validate.yml"

REQUIRED = (
    ADR,
    ARCH,
    COMMANDS,
    EVENTS,
    ENGINE,
    PERMISSIONS,
    API,
    PRIVATE_REQUEST,
    PROCESS_REQUEST,
    COMMAND_SCHEMA,
    EVENT_SCHEMA,
    WORKFLOW,
)


def normalized(value: str) -> str:
    return " ".join(value.replace("`", "").split()).lower()


def require_text(text: str, needles: tuple[str, ...], label: str, errors: list[str]) -> None:
    value = normalized(text)
    for needle in needles:
        if normalized(needle) not in value:
            errors.append(f"{label}: missing {needle}")


def command_entry(catalog: dict, command_type: str) -> dict | None:
    return next(
        (item for item in catalog.get("commands", []) if item.get("command_type") == command_type),
        None,
    )


def event_entry(catalog: dict, event_type: str) -> dict | None:
    return next(
        (item for item in catalog.get("events", []) if item.get("event_type") == event_type),
        None,
    )


def main() -> int:
    errors: list[str] = []
    for path in REQUIRED:
        if not path.is_file():
            errors.append(f"missing Gate 8A file: {path.relative_to(ROOT)}")
    if errors:
        return report(errors)

    adr = ADR.read_text(encoding="utf-8")
    require_text(
        adr,
        (
            "Status: Accepted",
            "POST /functions/v1/command-gateway",
            "No public expedition-bootstrap Edge Function",
            "private.bootstrap_expedition(jsonb)",
            "ILKA_DEFAULT_RUNTIME_RELEASE_KEY",
            "stream_head.current_stream_position = 1",
            "projection_head.current_projection_version = 0",
            "no Participant rows",
            "online-only",
        ),
        "ADR-017",
        errors,
    )

    architecture = ARCH.read_text(encoding="utf-8")
    require_text(
        architecture,
        (
            "pre-membership bootstrap path",
            "actor_id = authenticated profile UUID",
            "member_<membership_uuid_without_hyphens>",
            "existing trigger inserts stream_head(position=0)",
            "call private.process_command(process_command_request)",
            "No rejected receipt is persisted before an aggregate exists",
            "0 Participants",
            "0 invitations",
            "0 projection documents",
        ),
        "bootstrap architecture",
        errors,
    )

    commands = yaml.safe_load(COMMANDS.read_text(encoding="utf-8"))
    create_expedition = command_entry(commands, "create_expedition")
    if not create_expedition:
        errors.append("command catalog missing create_expedition")
    else:
        if create_expedition.get("allowed_actors") != ["captain"]:
            errors.append("create_expedition must be Captain-only")
        if create_expedition.get("offline_allowed") is not False:
            errors.append("create_expedition must be online-only")
        if create_expedition.get("emits") != ["expedition.created"]:
            errors.append("create_expedition must emit only expedition.created")
        required_payload = set(create_expedition.get("payload_required", []))
        expected_payload = {"name", "timezone", "duration_days", "day_boundary_local_time"}
        if required_payload != expected_payload:
            errors.append("create_expedition payload contract drifted")

    events = yaml.safe_load(EVENTS.read_text(encoding="utf-8"))
    created_event = event_entry(events, "expedition.created")
    if not created_event:
        errors.append("event catalog missing expedition.created")
    else:
        if created_event.get("projection_effect", {}).get("expedition.status") != "draft":
            errors.append("expedition.created must produce draft status")

    engine = yaml.safe_load(ENGINE.read_text(encoding="utf-8"))
    create_transition = engine.get("commands", {}).get("create_expedition", {})
    if create_transition.get("actor_roles") != ["captain"]:
        errors.append("game engine create_expedition actor drift")
    if create_transition.get("expedition_from") != [None]:
        errors.append("create_expedition must transition from no aggregate")
    if create_transition.get("emits") != ["expedition.created"]:
        errors.append("game engine create_expedition event drift")

    permissions = yaml.safe_load(PERMISSIONS.read_text(encoding="utf-8"))
    captain_commands = permissions.get("roles", {}).get("captain", {}).get("can", [])
    if "create_expedition" not in captain_commands:
        errors.append("Captain permission missing create_expedition")

    api = yaml.safe_load(API.read_text(encoding="utf-8"))
    if api.get("transport", {}).get("endpoint") != "/functions/v1/command-gateway":
        errors.append("command gateway must remain the only public write endpoint")
    bootstrap = api.get("expedition_bootstrap", {})
    expected = {
        "command_type": "create_expedition",
        "endpoint": "/functions/v1/command-gateway",
        "active_membership_required": False,
        "active_profile_required": True,
        "incoming_actor_id": "authenticated_profile_id",
        "authoritative_actor_id": "generated_captain_membership_id",
        "authoritative_actor_role": "captain",
        "runtime_release_source": "ILKA_DEFAULT_RUNTIME_RELEASE_KEY",
        "private_transaction": "private.bootstrap_expedition",
        "event": "expedition.created",
        "initial_expedition_status": "draft",
        "initial_stream_position": 1,
        "initial_projection_version": 0,
        "offline_allowed": False,
        "client_creates_local_aggregate": False,
    }
    for key, value in expected.items():
        if bootstrap.get(key) != value:
            errors.append(f"app bootstrap transport drift: {key}")

    request_schema = json.loads(PRIVATE_REQUEST.read_text(encoding="utf-8"))
    if request_schema.get("additionalProperties") is not False:
        errors.append("private bootstrap request must reject unknown top-level fields")
    if set(request_schema.get("required", [])) != {
        "expedition",
        "captain_membership",
        "process_command_request",
    }:
        errors.append("private bootstrap request top-level fields drifted")
    process = request_schema.get("properties", {}).get("process_command_request", {})
    process_text = json.dumps(process, sort_keys=True)
    for required in (
        "private-process-command-request.schema.json",
        '"const": 0',
        '"const": "accepted"',
        '"const": "create_expedition"',
        '"const": "captain"',
        '"const": "expedition.created"',
        '"maxItems": 0',
        '"maxItems": 1',
    ):
        if required not in process_text:
            errors.append(f"private bootstrap schema missing {required}")

    command_schema = json.loads(COMMAND_SCHEMA.read_text(encoding="utf-8"))
    if "create_expedition" not in command_schema.get("properties", {}).get("command_type", {}).get("enum", []):
        errors.append("canonical command schema missing create_expedition")

    event_schema = json.loads(EVENT_SCHEMA.read_text(encoding="utf-8"))
    if "expedition.created" not in event_schema.get("properties", {}).get("event_type", {}).get("enum", []):
        errors.append("canonical event schema missing expedition.created")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    if "Validate Expedition bootstrap contract" not in workflow:
        errors.append("protected CI missing Gate 8A validator")

    if errors:
        return report(errors)
    print("EXPEDITION BOOTSTRAP CONTRACT OK")
    return 0


def report(errors: list[str]) -> int:
    print("EXPEDITION BOOTSTRAP CONTRACT FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
