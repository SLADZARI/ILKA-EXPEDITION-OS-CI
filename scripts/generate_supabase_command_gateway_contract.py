#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "engine/command-catalog.yaml"
TARGET = (
    ROOT
    / "supabase/functions/_shared/command-gateway/command-contract.generated.ts"
)


def main() -> int:
    catalog = yaml.safe_load(SOURCE.read_text(encoding="utf-8"))
    commands = catalog.get("commands", [])
    contracts: dict[str, dict[str, object]] = {}

    for command in commands:
        command_type = command["command_type"]
        contracts[command_type] = {
            "allowedActors": command.get("allowed_actors", []),
            "offlineAllowed": bool(command.get("offline_allowed", False)),
        }

    object_literal = json.dumps(
        contracts,
        indent=2,
        ensure_ascii=False,
        sort_keys=True,
    )
    content = "\n".join(
        [
            "/* GENERATED from engine/command-catalog.yaml. Do not edit. */",
            f"export const COMMAND_CONTRACTS = {object_literal} as const;",
            "",
            "export type GatewayCommandType = keyof typeof COMMAND_CONTRACTS;",
            "export type GatewayActorRole =",
            '  (typeof COMMAND_CONTRACTS)[GatewayCommandType]["allowedActors"][number];',
            "",
        ]
    )

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(content, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
