#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]
PIPELINE = ROOT / "engine/pipeline.yaml"
STAGE = ROOT / "stages/01_onboarding.yaml"
ROTATION = ROOT / "engine/role-rotation-rules.yaml"
ROLES = ROOT / "engine/roles-catalog.yaml"
CARDS = ROOT / "cards"
TARGET = (
    ROOT
    / "supabase/functions/_shared/engine-runtime/day1-pilot-policy.generated.ts"
)

# Accepted ADR-018 / ADR-019 pilot policy. This is release composition metadata,
# not a UI or SQL default.
INVITATION_TTL_HOURS = 168


def load_yaml(path: Path) -> dict[str, Any]:
    value = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected_mapping:{path.relative_to(ROOT)}")
    return value


def card_frontmatter(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise ValueError(f"missing_frontmatter:{path.relative_to(ROOT)}")
    try:
        raw = text.split("---\n", 2)[1]
    except IndexError as error:
        raise ValueError(f"invalid_frontmatter:{path.relative_to(ROOT)}") from error
    value = yaml.safe_load(raw)
    if not isinstance(value, dict):
        raise ValueError(f"invalid_frontmatter:{path.relative_to(ROOT)}")
    return value


def card_catalog() -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for path in sorted(CARDS.rglob("*.md")):
        card = card_frontmatter(path)
        card_id = card.get("id")
        if not isinstance(card_id, str) or not card_id:
            raise ValueError(f"missing_card_id:{path.relative_to(ROOT)}")
        if card_id in result:
            raise ValueError(f"duplicate_card_id:{card_id}")
        result[card_id] = card
    return result


def title_from_id(value: str) -> str:
    return " ".join(part.capitalize() for part in value.split("_"))


def runtime_card(card_id: str, catalog: dict[str, dict[str, Any]]) -> dict[str, Any]:
    try:
        card = catalog[card_id]
    except KeyError as error:
        raise ValueError(f"unknown_card_reference:{card_id}") from error
    card_type = card.get("type")
    title = card.get("title")
    required = card.get("required")
    if card_type not in {"knowledge", "safety", "task", "role", "onboard"}:
        raise ValueError(f"unsupported_card_type:{card_id}:{card_type}")
    if not isinstance(title, str) or not title:
        raise ValueError(f"missing_card_title:{card_id}")
    if not isinstance(required, bool):
        raise ValueError(f"missing_card_required:{card_id}")
    return {
        "card_id": card_id,
        "type": card_type,
        "title": title,
        "required": required,
    }


def main() -> int:
    pipeline = load_yaml(PIPELINE)
    stage = load_yaml(STAGE)
    rotation = load_yaml(ROTATION)
    roles = load_yaml(ROLES)
    catalog = card_catalog()

    stages = pipeline.get("stages")
    if not isinstance(stages, list) or len(stages) < 2:
        raise ValueError("pipeline_requires_first_two_stages")
    first = stages[0]
    second = stages[1]
    if first.get("id") != "onboarding" or first.get("file") != "stages/01_onboarding.yaml":
        raise ValueError("onboarding_must_be_first_stage")

    assignment_rules = stage.get("assignment_rules", {})
    team_size = assignment_rules.get("team_size", {})
    rotation_config = rotation.get("rotation", {})
    initial_rotation = rotation.get("initial_rotation", {})
    role_cards = stage.get("card_refs", {})

    product_roles = {
        item["id"]: item for item in roles.get("product_roles", [])
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    onboard_roles = {
        item["id"]: item for item in roles.get("onboard_roles", [])
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }

    product_captain = initial_rotation.get("product_captain_role")
    product_support = initial_rotation.get("default_product_role")
    cook_role = "cook"
    onboard_cycle = rotation.get("onboard_role_cycle")
    if product_captain not in product_roles or product_support not in product_roles:
        raise ValueError("rotation_product_roles_missing_from_catalog")
    if not isinstance(onboard_cycle, list) or any(role not in onboard_roles for role in onboard_cycle):
        raise ValueError("rotation_onboard_cycle_missing_from_catalog")
    if cook_role not in onboard_cycle:
        raise ValueError("cook_missing_from_onboard_cycle")

    shared_refs = role_cards.get("shared", [])
    product_refs = role_cards.get("by_product_role", {})
    onboard_refs = role_cards.get("by_onboard_role", {})

    policy = {
        "duration_days": pipeline["duration_days"],
        "recovery_days_available": pipeline["recovery_day"]["max_uses"],
        "team_size_min": team_size["minimum"],
        "team_size_max": team_size["maximum"],
        "invitation_ttl_hours": INVITATION_TTL_HOURS,
        "rotation_rules_version": rotation_config["rules_version"],
        "onboard_role_cycle": onboard_cycle,
        "first_stage_id": stage["stage_id"],
        "product_captain_role": product_captain,
        "product_support_role": product_support,
        "cook_role": cook_role,
        "day1": {
            "day_number": 1,
            "stage_id": stage["stage_id"],
            "stage_title": stage["title"],
            "next_stage_id": second["id"],
            "rotation_rules_version": rotation_config["rules_version"],
            "product_role_titles": {
                product_captain: title_from_id(product_captain),
                product_support: title_from_id(product_support),
            },
            "onboard_role_titles": {
                role_id: title_from_id(role_id) for role_id in onboard_cycle
            },
            "shared_cards": [runtime_card(card_id, catalog) for card_id in shared_refs],
            "product_role_cards": {
                role_id: [runtime_card(card_id, catalog) for card_id in product_refs[role_id]]
                for role_id in (product_captain, product_support)
            },
            "onboard_role_cards": {
                role_id: [runtime_card(card_id, catalog) for card_id in onboard_refs[role_id]]
                for role_id in onboard_cycle
            },
            "required_outputs": [
                {
                    "output_id": output["id"],
                    "title": title_from_id(output["id"]),
                    "required": bool(output["required"]),
                }
                for output in stage.get("required_outputs", [])
            ],
        },
    }

    literal = json.dumps(policy, ensure_ascii=False, indent=2)
    content = "\n".join(
        [
            "/* GENERATED from engine/pipeline.yaml, engine/role-rotation-rules.yaml,",
            " * engine/roles-catalog.yaml, stages/01_onboarding.yaml and cards/. Do not edit. */",
            f"export const DAY1_PILOT_POLICY = {literal} as const;",
            "",
        ]
    )
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(content, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
