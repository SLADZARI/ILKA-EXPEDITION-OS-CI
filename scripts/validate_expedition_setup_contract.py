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
COMMAND_SCHEMA = ROOT / "schemas/command.schema.json"
EVENT_SCHEMA = ROOT / "engine/event.schema.json"
COMMANDS = ROOT / "engine/command-catalog.yaml"
EVENTS = ROOT / "engine/event-catalog.yaml"
ENGINE = ROOT / "engine/game-engine.yaml"
PERMISSIONS = ROOT / "engine/permissions.yaml"
APP_COMMANDS = ROOT / "app/api/commands.yaml"
RUNTIME_REGISTRY = ROOT / "supabase/functions/_shared/command-gateway/runtime-registry.ts"
WORKFLOW = ROOT / ".github/workflows/validate.yml"
CHANGELOG = ROOT / "CHANGELOG.md"
SETUP_COMMAND_EXAMPLES = ROOT / "examples/sample-expedition-setup-commands.json"
SETUP_EVENT_EXAMPLES = ROOT / "examples/sample-expedition-setup-events.json"

SETUP_COMMANDS = {"invite_participant", "accept_invitation", "revoke_invitation"}
SETUP_EVENTS = {"invitation.created", "invitation.accepted", "invitation.revoked", "expedition.ready"}
FORBIDDEN_SECRET_FIELDS = {"email", "email_normalized", "token", "invitation_token", "token_hash"}


def report(errors: list[str]) -> int:
    print("EXPEDITION SETUP CONTRACT FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


def entry(items: list[dict], key: str, value: str) -> dict | None:
    return next((item for item in items if item.get(key) == value), None)


def branch(schema: dict, discriminator: str, value: str) -> dict | None:
    for candidate in schema.get("allOf", []):
        if candidate.get("if", {}).get("properties", {}).get(discriminator, {}).get("const") == value:
            return candidate
    return None


def main() -> int:
    errors: list[str] = []
    required = (
        ADR, ARCH, SETUP_SCHEMA, COMMAND_SCHEMA, EVENT_SCHEMA, COMMANDS, EVENTS,
        ENGINE, PERMISSIONS, APP_COMMANDS, RUNTIME_REGISTRY, WORKFLOW, CHANGELOG,
        SETUP_COMMAND_EXAMPLES, SETUP_EVENT_EXAMPLES,
    )
    for path in required:
        if not path.is_file():
            errors.append(f"missing Gate 9B1 file: {path.relative_to(ROOT)}")
    if errors:
        return report(errors)

    commands = yaml.safe_load(COMMANDS.read_text(encoding="utf-8"))
    command_items = commands.get("commands", [])
    command_types = {item.get("command_type") for item in command_items}
    if not SETUP_COMMANDS <= command_types:
        errors.append(f"missing setup commands: {sorted(SETUP_COMMANDS-command_types)}")
    legacy = commands.get("legacy_commands", {}).get("add_participant", {})
    if legacy.get("external_api_allowed") is not False or legacy.get("replacement") != "accept_invitation":
        errors.append("add_participant must be legacy non-public with accept_invitation replacement")
    add = entry(command_items, "command_type", "add_participant") or {}
    if add.get("allowed_actors") != [] or add.get("external_api_allowed") is not False:
        errors.append("legacy add_participant must have no executable actor and no external API")

    expected_commands = {
        "invite_participant": (["captain"], {"email", "invitation_token"}, ["invitation.created"]),
        "accept_invitation": (["participant"], {"invitation_token", "display_name"}, ["invitation.accepted", "participant.added"]),
        "revoke_invitation": (["captain"], {"invitation_id", "reason"}, ["invitation.revoked"]),
    }
    for name, (actors, payload, emits) in expected_commands.items():
        item = entry(command_items, "command_type", name) or {}
        if item.get("allowed_actors") != actors:
            errors.append(f"{name} actor contract drifted")
        if set(item.get("payload_required", [])) != payload:
            errors.append(f"{name} payload contract drifted")
        if item.get("emits") != emits:
            errors.append(f"{name} event contract drifted")
        if item.get("offline_allowed") is not False:
            errors.append(f"{name} must remain online-only")
    accept = entry(command_items, "command_type", "accept_invitation") or {}
    if accept.get("pre_membership_allowed") is not True:
        errors.append("accept_invitation must be the explicit pre-membership setup path")

    rotation = entry(command_items, "command_type", "generate_rotation") or {}
    if rotation.get("emits") != ["rotation.generated", "expedition.ready"]:
        errors.append("generate_rotation must append rotation.generated then expedition.ready")

    events = yaml.safe_load(EVENTS.read_text(encoding="utf-8"))
    event_items = events.get("events", [])
    event_types = {item.get("event_type") for item in event_items}
    if not SETUP_EVENTS <= event_types:
        errors.append(f"missing setup events: {sorted(SETUP_EVENTS-event_types)}")
    expected_event_payloads = {
        "invitation.created": {"invitation_id", "email_hint", "role", "expires_at"},
        "invitation.accepted": {"invitation_id", "participant_id"},
        "invitation.revoked": {"invitation_id", "reason"},
        "expedition.ready": {"rotation_id"},
        "participant.added": {"participant_id", "display_name", "participant_order"},
    }
    for name, payload in expected_event_payloads.items():
        item = entry(event_items, "event_type", name) or {}
        if set(item.get("payload_required", [])) != payload:
            errors.append(f"{name} payload contract drifted")
        if FORBIDDEN_SECRET_FIELDS & payload and name.startswith("invitation."):
            errors.append(f"{name} event catalog exposes invitation secret fields")

    engine = yaml.safe_load(ENGINE.read_text(encoding="utf-8"))
    engine_commands = engine.get("commands", {})
    for name in SETUP_COMMANDS:
        if name not in engine_commands:
            errors.append(f"game engine missing {name}")
    if engine_commands.get("generate_rotation", {}).get("expedition_from") != ["draft"]:
        errors.append("generate_rotation must be draft-only")
    if engine_commands.get("generate_rotation", {}).get("emits") != ["rotation.generated", "expedition.ready"]:
        errors.append("game engine generate_rotation event order drifted")
    if engine_commands.get("start_expedition", {}).get("expedition_from") != ["ready"]:
        errors.append("start_expedition must be ready-only")
    if engine_commands.get("add_participant", {}).get("actor_roles") != []:
        errors.append("game engine legacy add_participant must be non-executable")

    permissions = yaml.safe_load(PERMISSIONS.read_text(encoding="utf-8"))
    roles = permissions.get("roles", {})
    captain = set(roles.get("captain", {}).get("can", []))
    participant = set(roles.get("participant", {}).get("can", []))
    if not {"invite_participant", "revoke_invitation", "generate_rotation", "start_expedition"} <= captain:
        errors.append("Captain setup permissions incomplete")
    if "accept_invitation" not in participant:
        errors.append("participant provisional accept_invitation permission missing")
    if "add_participant" in captain:
        errors.append("Captain must not retain public add_participant permission")
    restrictions = permissions.get("restrictions", {})
    for key in (
        "participant_onboarding_requires_accepted_invitation",
        "setup_commands_online_only",
        "invitation_tokens_server_hashed",
        "product_captain_has_no_setup_membership_authority",
        "ready_setup_is_frozen",
    ):
        if restrictions.get(key) is not True:
            errors.append(f"permission restriction missing: {key}")

    command_schema = json.loads(COMMAND_SCHEMA.read_text(encoding="utf-8"))
    command_enum = set(command_schema.get("properties", {}).get("command_type", {}).get("enum", []))
    if not SETUP_COMMANDS <= command_enum:
        errors.append("canonical command schema missing setup commands")
    for name in SETUP_COMMANDS:
        candidate = branch(command_schema, "command_type", name)
        if candidate is None:
            errors.append(f"canonical command schema missing payload branch for {name}")
            continue
        payload = candidate["then"]["properties"]["payload"]
        if payload.get("additionalProperties") is not False:
            errors.append(f"{name} payload must reject unknown fields")
        token_schema = payload.get("properties", {}).get("invitation_token")
        if token_schema and token_schema.get("pattern") != "^[A-Za-z0-9_-]{43}$":
            errors.append(f"{name} invitation token format drifted")

    event_schema = json.loads(EVENT_SCHEMA.read_text(encoding="utf-8"))
    event_enum = set(event_schema.get("properties", {}).get("event_type", {}).get("enum", []))
    if not SETUP_EVENTS <= event_enum:
        errors.append("canonical event schema missing setup events")
    for name in SETUP_EVENTS:
        candidate = branch(event_schema, "event_type", name)
        if candidate is None:
            errors.append(f"canonical event schema missing payload branch for {name}")
            continue
        payload = candidate["then"]["properties"]["payload"]
        properties = set(payload.get("properties", {}))
        leaked = FORBIDDEN_SECRET_FIELDS & properties
        if leaked:
            errors.append(f"{name} schema leaks secret fields: {sorted(leaked)}")
        if name.startswith("invitation.") and payload.get("additionalProperties") is not False:
            errors.append(f"{name} payload must reject privacy-breaking extra fields")

    app = yaml.safe_load(APP_COMMANDS.read_text(encoding="utf-8"))
    setup = app.get("expedition_setup", {})
    if setup.get("legacy_non_public_commands") != ["add_participant"]:
        errors.append("app transport must mark add_participant legacy non-public")
    if set(setup.get("commands", {})) != SETUP_COMMANDS:
        errors.append("app setup transport command set drifted")
    secret = setup.get("secret_handling", {})
    if secret.get("persisted_value") != "sha256_only":
        errors.append("app setup transport must persist invitation hash only")

    setup_schema = json.loads(SETUP_SCHEMA.read_text(encoding="utf-8"))
    invitation_properties = (
        setup_schema.get("properties", {}).get("invitations", {}).get("items", {}).get("properties", {})
    )
    leaked_projection = FORBIDDEN_SECRET_FIELDS & set(invitation_properties)
    if leaked_projection:
        errors.append(f"ExpeditionSetupView leaks invitation fields: {sorted(leaked_projection)}")

    command_examples = json.loads(SETUP_COMMAND_EXAMPLES.read_text(encoding="utf-8"))
    if {item.get("command_type") for item in command_examples} != SETUP_COMMANDS:
        errors.append("setup command examples must cover all three commands")
    event_examples = json.loads(SETUP_EVENT_EXAMPLES.read_text(encoding="utf-8"))
    serialized_events = json.dumps(event_examples, sort_keys=True)
    if "invitation_token" in serialized_events or "token_hash" in serialized_events or "anna@example.test" in serialized_events:
        errors.append("setup event examples expose raw invitation identity or secret")

    registry = RUNTIME_REGISTRY.read_text(encoding="utf-8")
    if "day1_pilot_v1" in registry:
        errors.append("Gate 9B1 must not register day1_pilot_v1")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    if "python scripts/validate_expedition_setup_contract.py" not in workflow:
        errors.append("protected CI does not execute Expedition setup validator")

    changelog = CHANGELOG.read_text(encoding="utf-8")
    if "Gate 9B1 canonical Expedition setup contracts" not in changelog:
        errors.append("CHANGELOG missing Gate 9B1 record")

    if errors:
        return report(errors)
    print("EXPEDITION SETUP CONTRACT OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
