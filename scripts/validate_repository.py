#!/usr/bin/env python3
from pathlib import Path
import argparse
import json
import re
import sys
import yaml
from jsonschema import Draft202012Validator, FormatChecker

FRONT = re.compile(r"^---\n(.*?)\n---\n", re.S)
LEGACY_ROLE = "product_duty_officer"


def load_yaml(path: Path):
    with path.open(encoding="utf-8") as stream:
        return yaml.safe_load(stream)


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def schema_errors(schema, value):
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    return sorted(validator.iter_errors(value), key=lambda e: list(e.path))


def flatten_stage_refs(stage):
    refs = set(stage["card_refs"]["shared"])
    for group in ("by_product_role", "by_onboard_role"):
        for values in stage["card_refs"][group].values():
            refs.update(values)
    return refs


def command_schema_types(schema):
    return set(schema["properties"]["command_type"]["enum"])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("repo", nargs="?", default=".")
    root = Path(parser.parse_args().repo).resolve()
    errors = []

    required_files = [
        "engine/game-engine.yaml",
        "engine/command-catalog.yaml",
        "engine/event-catalog.yaml",
        "engine/event.schema.json",
        "engine/permissions.yaml",
        "engine/reducers.yaml",
        "engine/pipeline.yaml",
        "engine/roles-catalog.yaml",
        "engine/gamification-rules.yaml",
        "schemas/command.schema.json",
        "schemas/card.schema.json",
        "schemas/stage.schema.json",
        "schemas/gamification.schema.json",
        "cards/manifest.yaml",
        "app/api/commands.yaml",
        "app/api/day-projection.yaml",
        "app/contracts/offline-command.schema.json",
        "app/contracts/today-view.schema.json",
        "app/contracts/captain-day-view.schema.json",
        "app/contracts/gamification-view.schema.json",
        "examples/sample-commands.json",
        "examples/sample-events.json",
        "examples/sample-super-admin-events.json",
        "examples/sample-decision-events.json",
        "examples/sample-app-events.json",
        "examples/sample-gamification-events.json",
    ]
    for relative in required_files:
        if not (root / relative).exists():
            errors.append(f"missing required file {relative}")
    if errors:
        print("VALIDATION FAILED")
        for error in errors:
            print("-", error)
        return 1

    card_schema = load_json(root / "schemas/card.schema.json")
    stage_schema = load_json(root / "schemas/stage.schema.json")
    command_schema = load_json(root / "schemas/command.schema.json")
    event_schema = load_json(root / "engine/event.schema.json")
    offline_schema = load_json(root / "app/contracts/offline-command.schema.json")
    manifest = load_yaml(root / "cards/manifest.yaml")
    pipeline = load_yaml(root / "engine/pipeline.yaml")
    roles = load_yaml(root / "engine/roles-catalog.yaml")
    permissions = load_yaml(root / "engine/permissions.yaml")
    game_engine = load_yaml(root / "engine/game-engine.yaml")
    event_catalog = load_yaml(root / "engine/event-catalog.yaml")
    command_catalog = load_yaml(root / "engine/command-catalog.yaml")
    app_commands = load_yaml(root / "app/api/commands.yaml")
    gamification_rules = load_yaml(root / "engine/gamification-rules.yaml")
    gamification_schema = load_json(root / "schemas/gamification.schema.json")

    events = {item["event_type"] for item in event_catalog["events"]}
    catalog_commands = {item["command_type"]: item for item in command_catalog["commands"]}
    engine_commands = set(game_engine["commands"])
    schema_commands = command_schema_types(command_schema)
    offline_commands = command_schema_types(offline_schema)
    permission_roles = set(permissions["roles"])
    product_roles = {item["id"]: item for item in roles["product_roles"]}
    onboard_roles = {item["id"]: item for item in roles["onboard_roles"]}

    # Command ownership and canonical IDs.
    if set(catalog_commands) != engine_commands:
        errors.append(
            f"command catalog/game engine mismatch catalog_only={sorted(set(catalog_commands)-engine_commands)} "
            f"engine_only={sorted(engine_commands-set(catalog_commands))}"
        )
    if set(catalog_commands) != schema_commands:
        errors.append(
            f"command catalog/schema mismatch catalog_only={sorted(set(catalog_commands)-schema_commands)} "
            f"schema_only={sorted(schema_commands-set(catalog_commands))}"
        )
    if schema_commands != offline_commands:
        errors.append("offline-command schema command types differ from command schema")
    if command_catalog["command_envelope"].get("idempotency_key") != game_engine["idempotency"].get("command_key"):
        errors.append("command idempotency key mismatch")

    for command_type, command in catalog_commands.items():
        unknown_events = set(command.get("emits", [])) - events
        if unknown_events:
            errors.append(f"{command_type}: unknown emitted events {sorted(unknown_events)}")
        unknown_actors = set(command.get("allowed_actors", [])) - permission_roles
        if unknown_actors:
            errors.append(f"{command_type}: actors missing from permissions {sorted(unknown_actors)}")
        engine_actors = set(game_engine["commands"][command_type].get("actor_roles", []))
        if set(command.get("allowed_actors", [])) != engine_actors:
            errors.append(f"{command_type}: actor mismatch between catalog and game engine")
        engine_events = set(game_engine["commands"][command_type].get("emits", []))
        if set(command.get("emits", [])) != engine_events:
            errors.append(f"{command_type}: emitted event mismatch between catalog and game engine")

        for actor in command.get("allowed_actors", []):
            if actor in permissions["roles"] and command_type not in permissions["roles"][actor].get("can", []):
                errors.append(f"{command_type}: missing permission for actor {actor}")

    # Canonical Product Captain in active contracts; legacy alias is allowed only in migration map/history/tests.
    if LEGACY_ROLE in permission_roles:
        errors.append("permissions still define legacy product_duty_officer role")
    for command_name, config in game_engine["commands"].items():
        if LEGACY_ROLE in config.get("actor_roles", []):
            errors.append(f"{command_name}: legacy actor role")
    for schema_name, schema in (("command", command_schema), ("event", event_schema), ("offline-command", offline_schema)):
        if LEGACY_ROLE in schema["properties"]["actor_role"]["enum"]:
            errors.append(f"{schema_name} schema contains legacy actor role")

    # App projection must not redefine business rules.
    if app_commands.get("kind") != "transport_projection" or app_commands.get("source_of_truth") != "engine/command-catalog.yaml":
        errors.append("app/api/commands.yaml is not a transport-only projection")
    queueable = set(app_commands["offline_delivery"]["queueable_commands"])
    if not queueable <= set(catalog_commands):
        errors.append(f"app queue contains unknown commands {sorted(queueable-set(catalog_commands))}")
    for name in queueable & set(catalog_commands):
        if not catalog_commands[name].get("offline_allowed", False):
            errors.append(f"{name}: queueable but catalog offline_allowed is false")
    server_confirmation = set(app_commands["server_confirmation_required"])
    for name in server_confirmation & set(catalog_commands):
        if not catalog_commands[name].get("requires_server_confirmation", False):
            errors.append(f"{name}: app server-confirmed but catalog disabled")
    server_only = set(app_commands.get("server_only_commands", []))
    for name in server_only:
        if name not in catalog_commands:
            errors.append(f"server-only command unknown: {name}")
        elif not catalog_commands[