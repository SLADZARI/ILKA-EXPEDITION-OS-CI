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
        "engine/game-engine.yaml", "engine/command-catalog.yaml", "engine/event-catalog.yaml",
        "engine/event.schema.json", "engine/permissions.yaml", "engine/reducers.yaml",
        "engine/pipeline.yaml", "engine/roles-catalog.yaml", "engine/gamification-rules.yaml",
        "schemas/command.schema.json", "schemas/card.schema.json", "schemas/stage.schema.json",
        "schemas/gamification.schema.json", "cards/manifest.yaml", "app/api/commands.yaml",
        "app/api/day-projection.yaml", "app/contracts/offline-command.schema.json",
        "app/contracts/today-view.schema.json", "app/contracts/captain-day-view.schema.json",
        "app/contracts/expedition-setup-view.schema.json",
        "app/contracts/gamification-view.schema.json", "examples/sample-commands.json",
        "examples/sample-events.json", "examples/sample-super-admin-events.json",
        "examples/sample-decision-events.json", "examples/sample-app-events.json",
        "examples/sample-gamification-events.json", "examples/sample-expedition-setup-commands.json",
        "examples/sample-expedition-setup-events.json",
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
    offline_allowed_commands = {
        command_type for command_type, command in catalog_commands.items()
        if command.get("offline_allowed", False)
    }
    if offline_allowed_commands != offline_commands:
        errors.append(
            f"offline-command schema mismatch catalog_only={sorted(offline_allowed_commands-offline_commands)} "
            f"schema_only={sorted(offline_commands-offline_allowed_commands)}"
        )
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

    if LEGACY_ROLE in permission_roles:
        errors.append("permissions still define legacy product_duty_officer role")
    for command_name, config in game_engine["commands"].items():
        if LEGACY_ROLE in config.get("actor_roles", []):
            errors.append(f"{command_name}: legacy actor role")
    for schema_name, schema in (("command", command_schema), ("event", event_schema), ("offline-command", offline_schema)):
        if LEGACY_ROLE in schema["properties"]["actor_role"]["enum"]:
            errors.append(f"{schema_name} schema contains legacy actor role")

    if app_commands.get("kind") != "transport_projection" or app_commands.get("source_of_truth") != "engine/command-catalog.yaml":
        errors.append("app/api/commands.yaml is not a transport-only projection")
    queueable = set(app_commands["offline_delivery"]["queueable_commands"])
    if not queueable <= set(catalog_commands):
        errors.append(f"app queue contains unknown commands {sorted(queueable-set(catalog_commands))}")
    for name in queueable & set(catalog_commands):
        if not catalog_commands[name].get("offline_allowed", False):
            errors.append(f"{name}: queueable in app but not offline_allowed in catalog")

    decision_commands = {"create_decision_draft", "create_vote", "vote", "finalize_product_decision", "override_product_decision"}
    if not decision_commands <= set(catalog_commands):
        errors.append(f"missing Product Decision commands {sorted(decision_commands-set(catalog_commands))}")
    decision_events = {"decision.draft_created", "vote.opened", "vote.cast", "vote.closed", "product_decision.recorded", "product_decision.overridden"}
    if not decision_events <= events:
        errors.append(f"missing Product Decision events {sorted(decision_events-events)}")

    gamification_commands = {"verify_role_assignment", "adjust_role_xp", "publish_rating_snapshot"}
    if not gamification_commands <= set(catalog_commands):
        errors.append(f"missing Gamification commands {sorted(gamification_commands-set(catalog_commands))}")
    gamification_events = {"role_assignment.verified", "role_xp.awarded", "role_xp.adjusted", "role_level.changed", "rating.snapshot_published"}
    if not gamification_events <= events:
        errors.append(f"missing Gamification events {sorted(gamification_events-events)}")
    if gamification_rules.get("source_of_truth") != "engine/gamification-rules.yaml":
        errors.append("gamification rules source_of_truth mismatch")
    if gamification_rules.get("ledger", {}).get("allow_direct_client_award") is not False:
        errors.append("direct client XP award must remain disabled")
    if gamification_rules.get("ledger", {}).get("allow_negative_balance") is not False:
        errors.append("negative role XP balance must remain disabled")

    cards = {}
    for path in sorted((root / "cards").rglob("*.md")):
        match = FRONT.match(path.read_text(encoding="utf-8"))
        if not match:
            errors.append(f"{path.relative_to(root)}: missing YAML frontmatter")
            continue
        metadata = yaml.safe_load(match.group(1))
        for error in schema_errors(card_schema, metadata):
            errors.append(f"{path.relative_to(root)}: schema: {error.message}")
        card_id = metadata.get("id")
        if card_id in cards:
            errors.append(f"duplicate card id {card_id}: {cards[card_id]['path']} and {path.relative_to(root)}")
        cards[card_id] = {"path": path.relative_to(root), "meta": metadata}
        completion_event = metadata.get("completion_event_type")
        if completion_event and completion_event not in events:
            errors.append(f"{card_id}: unknown completion event {completion_event}")

    manifest_stage_ids = manifest.get("stage_card_ids", {})
    manifest_ids = {card_id for ids in manifest_stage_ids.values() for card_id in ids}
    if manifest.get("card_count") != len(cards):
        errors.append(f"manifest card_count={manifest.get('card_count')} actual={len(cards)}")
    if manifest_ids != set(cards):
        errors.append(
            f"manifest/file mismatch missing={sorted(manifest_ids-set(cards))} "
            f"extra={sorted(set(cards)-manifest_ids)}"
        )

    seen_stage_ids, seen_orders = set(), set()
    for entry in pipeline["stages"]:
        stage_path = root / entry["file"]
        if not stage_path.exists():
            errors.append(f"pipeline missing stage file {entry['file']}")
            continue
        text = stage_path.read_text(encoding="utf-8")
        if LEGACY_ROLE in text or "Product Duty Officer" in text:
            errors.append(f"{entry['file']}: legacy Product Captain terminology")
        stage = yaml.safe_load(text)
        for error in schema_errors(stage_schema, stage):
            path = ".".join(str(x) for x in error.absolute_path)
            errors.append(f"{entry['file']}: schema{':' + path if path else ''}: {error.message}")
        if stage.get("stage_id") != entry["id"]:
            errors.append(f"{entry['file']}: stage_id does not match pipeline")
        if stage.get("order") != entry["order"]:
            errors.append(f"{entry['file']}: order does not match pipeline")
        if stage.get("stage_id") in seen_stage_ids:
            errors.append(f"duplicate stage_id {stage.get('stage_id')}")
        if stage.get("order") in seen_orders:
            errors.append(f"duplicate stage order {stage.get('order')}")
        seen_stage_ids.add(stage.get("stage_id"))
        seen_orders.add(stage.get("order"))

        allowed = set(stage.get("allowed_product_roles", []))
        required = {item["role_id"] for item in stage.get("required_product_roles", [])}
        unknown_allowed = allowed - set(product_roles)
        if unknown_allowed:
            errors.append(f"{entry['file']}: unknown allowed product roles {sorted(unknown_allowed)}")
        if not required <= allowed:
            errors.append(f"{entry['file']}: required product roles must be allowed")
        for role_id in allowed & set(product_roles):
            available = set(product_roles[role_id].get("available_stages", []))
            if "*" not in available and stage["stage_id"] not in available:
                errors.append(f"{entry['file']}: role {role_id} unavailable for stage")
        product_ref_roles = set(stage["card_refs"]["by_product_role"])
        onboard_ref_roles = set(stage["card_refs"]["by_onboard_role"])
        if not product_ref_roles <= allowed:
            errors.append(f"{entry['file']}: card refs use non-allowed product role")
        if not onboard_ref_roles <= set(onboard_roles):
            errors.append(f"{entry['file']}: card refs use unknown onboard role")

        refs = flatten_stage_refs(stage)
        missing_cards = refs - set(cards)
        if missing_cards:
            errors.append(f"{entry['file']}: missing card refs {sorted(missing_cards)}")
        if stage["stage_id"] in manifest_stage_ids and refs != set(manifest_stage_ids[stage["stage_id"]]):
            errors.append(f"{entry['file']}: stage/manifest card mismatch")
        for card_id in refs & set(cards):
            available_stages = set(cards[card_id]["meta"].get("available_stages", []))
            if stage["stage_id"] not in available_stages:
                errors.append(f"{entry['file']}: card {card_id} unavailable for stage")

        output_ids = {item["id"] for item in stage.get("required_outputs", [])}
        for condition in stage.get("definition_of_done", {}).get("all", []):
            if "output_confirmed" in condition and condition["output_confirmed"] not in output_ids:
                errors.append(f"{entry['file']}: DoD references unknown output {condition['output_confirmed']}")
        override = stage.get("definition_of_done", {}).get("captain_override")
        if override and override["emits"] not in events:
            errors.append(f"{entry['file']}: unknown captain override event {override['emits']}")
        unknown_controls = set(stage.get("captain_controls", [])) - set(catalog_commands)
        if unknown_controls:
            errors.append(f"{entry['file']}: non-canonical captain controls {sorted(unknown_controls)}")

    for schema in (
        card_schema, stage_schema, command_schema, event_schema, offline_schema,
        load_json(root / "app/contracts/today-view.schema.json"),
        load_json(root / "app/contracts/captain-day-view.schema.json"),
        load_json(root / "app/contracts/expedition-setup-view.schema.json"),
        gamification_schema, load_json(root / "app/contracts/gamification-view.schema.json"),
    ):
        try:
            Draft202012Validator.check_schema(schema)
        except Exception as exc:
            errors.append(f"invalid JSON Schema {schema.get('$id', schema.get('title'))}: {exc}")

    for command_filename in ("sample-commands.json", "sample-expedition-setup-commands.json"):
        for index, command in enumerate(load_json(root / "examples" / command_filename)):
            for error in schema_errors(command_schema, command):
                errors.append(f"examples/{command_filename}[{index}]: {error.message}")
            if command.get("command_type") not in catalog_commands:
                errors.append(f"{command_filename}: unknown command type {command.get('command_type')}")

    for filename in (
        "sample-events.json", "sample-super-admin-events.json", "sample-decision-events.json",
        "sample-app-events.json", "sample-gamification-events.json",
        "sample-expedition-setup-events.json",
    ):
        for index, event in enumerate(load_json(root / "examples" / filename)):
            for error in schema_errors(event_schema, event):
                errors.append(f"examples/{filename}[{index}]: {error.message}")
            if event.get("event_type") not in events:
                errors.append(f"{filename}: unknown event type {event.get('event_type')}")

    if (root / "app/contracts/day-view-state.schema.json").exists():
        errors.append("retired app/contracts/day-view-state.schema.json is still active")

    if errors:
        print("VALIDATION FAILED")
        for error in errors:
            print("-", error)
        return 1

    print(
        f"VALIDATION OK: {len(cards)} cards, {len(pipeline['stages'])} stages, "
        f"{len(events)} event types, {len(catalog_commands)} commands"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
