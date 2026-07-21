#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one replacement, found {count}")
    return text.replace(old, new, 1)


# Canonical rotation policy.
role_rules_path = ROOT / "engine/role-rotation-rules.yaml"
role_rules = role_rules_path.read_text(encoding="utf-8")
role_rules = replace_once(
    role_rules,
    "  participant_order_source: expedition_membership_order\n",
    "  participant_order_source: participants.participant_order\n",
    "role rotation participant order source",
)
role_rules = replace_once(
    role_rules,
    "  seed_fields: [expedition_id, participant_order]\n",
    "  rules_version: 2\n"
    "  seed_fields: [expedition_key, rotation_rules_version, participant_id, participant_order]\n",
    "role rotation seed fields",
)
if "initial_rotation:" not in role_rules:
    role_rules = replace_once(
        role_rules,
        "onboard_role_cycle: [navigation, mooring, order, cook, product_focus]\n",
        "onboard_role_cycle: [navigation, mooring, order, cook, product_focus]\n"
        "initial_rotation:\n"
        "  stage_id: onboarding\n"
        "  participant_order_source: participants.participant_order\n"
        "  product_captain_selection: lowest_participant_order_not_cook\n"
        "  product_captain_role: product_captain\n"
        "  default_product_role: product_support\n"
        "  cook_product_role: product_support\n"
        "  assignment_scope: initial_day_1\n",
        "initial rotation policy",
    )
role_rules_path.write_text(role_rules, encoding="utf-8")

# Canonical command actor and payload.
command_catalog_path = ROOT / "engine/command-catalog.yaml"
command_catalog = command_catalog_path.read_text(encoding="utf-8")
command_catalog = replace_once(
    command_catalog,
    "- command_type: generate_rotation\n"
    "  allowed_actors: [captain, system]\n"
    "  payload_required: [seed, rules_version]\n"
    "  emits: [rotation.generated, expedition.ready]\n"
    "  offline_allowed: false\n",
    "- command_type: generate_rotation\n"
    "  allowed_actors: [captain]\n"
    "  payload_required: []\n"
    "  emits: [rotation.generated, expedition.ready]\n"
    "  offline_allowed: false\n",
    "command catalog generate_rotation",
)
command_catalog_path.write_text(command_catalog, encoding="utf-8")

command_schema_path = ROOT / "schemas/command.schema.json"
command_schema = json.loads(command_schema_path.read_text(encoding="utf-8"))
matched = 0
for conditional in command_schema.get("allOf", []):
    condition = conditional.get("if", {}).get("properties", {}).get("command_type", {})
    if condition.get("const") == "generate_rotation":
        conditional["then"] = {
            "properties": {
                "payload": {
                    "type": "object",
                    "required": [],
                    "properties": {},
                    "additionalProperties": False,
                }
            }
        }
        matched += 1
if matched != 1:
    raise SystemExit(f"command schema generate_rotation conditional count: {matched}")
command_schema_path.write_text(
    json.dumps(command_schema, ensure_ascii=False, separators=(",", ":")) + "\n",
    encoding="utf-8",
)

# Engine state and permissions.
game_engine_path = ROOT / "engine/game-engine.yaml"
game_engine = game_engine_path.read_text(encoding="utf-8")
game_engine = replace_once(
    game_engine,
    "  generate_rotation:\n"
    "    actor_roles: [captain, system]\n"
    "    expedition_from: [draft]\n",
    "  generate_rotation:\n"
    "    actor_roles: [captain]\n"
    "    expedition_from: [draft]\n",
    "game engine generate_rotation actor",
)
game_engine_path.write_text(game_engine, encoding="utf-8")

permissions_path = ROOT / "engine/permissions.yaml"
permissions = permissions_path.read_text(encoding="utf-8")
permissions = replace_once(
    permissions,
    "  system:\n"
    "    can:\n"
    "    - generate_rotation\n"
    "    - recover_day_transition\n",
    "  system:\n"
    "    can:\n"
    "    - recover_day_transition\n",
    "system rotation permission",
)
if "  rotation_generation: captain_only_server_confirmed\n" not in permissions:
    permissions = replace_once(
        permissions,
        "  ready_setup_is_frozen: true\n",
        "  ready_setup_is_frozen: true\n"
        "  rotation_generation: captain_only_server_confirmed\n"
        "  rotation_assignments_server_derived: true\n"
        "  rotation_seed_server_derived: true\n",
        "rotation restrictions",
    )
permissions_path.write_text(permissions, encoding="utf-8")

# Gateway routing.
handler_path = ROOT / "supabase/functions/_shared/command-gateway/handler.ts"
handler = handler_path.read_text(encoding="utf-8")
rotation_import = 'import type { RotationExecutor } from "./rotation.ts";\n'
handler = handler.replace(rotation_import, "")
handler = replace_once(
    handler,
    'import type { InvitationExecutor } from "./invitation.ts";\n',
    'import type { InvitationExecutor } from "./invitation.ts";\n' + rotation_import,
    "handler rotation import",
)
if "rotationExecutor?: RotationExecutor" not in handler:
    handler = replace_once(
        handler,
        "  bootstrapExecutor?: BootstrapExecutor,\n"
        "  invitationExecutor?: InvitationExecutor,\n"
        "): (request: Request) => Promise<Response> {",
        "  bootstrapExecutor?: BootstrapExecutor,\n"
        "  invitationExecutor?: InvitationExecutor,\n"
        "  rotationExecutor?: RotationExecutor,\n"
        "): (request: Request) => Promise<Response> {",
        "handler rotation parameter",
    )
if "rotationExecutor.execute" not in handler:
    rotation_branch = '''    if (command.command_type === "generate_rotation") {
      if (!rotationExecutor) {
        return errorResponse(
          503,
          requestId,
          "runtime_release_unavailable",
          "The Expedition's pinned rotation runtime is unavailable.",
          true,
          origin,
          true,
        );
      }

      let outcome;
      try {
        outcome = await rotationExecutor.execute({
          command,
          auth_user: authUser,
          request_hash: requestHash,
        });
      } catch {
        return errorResponse(
          503,
          requestId,
          "rotation_persistence_unavailable",
          "The Rotation Plan could not be committed.",
          true,
          origin,
          true,
        );
      }

      if (!outcome.ok) {
        return errorResponse(
          outcome.status,
          requestId,
          outcome.code,
          outcome.message,
          outcome.retryable,
          origin,
          true,
          outcome.details,
        );
      }

      return jsonResponse(
        responseStatus(outcome.result),
        { request_id: requestId, data: outcome.result },
        origin,
        true,
      );
    }

'''
    handler = replace_once(
        handler,
        "    let context: GatewayExecutionContext | null;\n",
        rotation_branch + "    let context: GatewayExecutionContext | null;\n",
        "handler rotation branch",
    )
handler_path.write_text(handler, encoding="utf-8")

index_path = ROOT / "supabase/functions/command-gateway/index.ts"
index = index_path.read_text(encoding="utf-8")
for duplicate in (
    'import { PostgresRotationDatabase } from "../_shared/command-gateway/rotation-database.ts";\n',
    'import { createRotationExecutor } from "../_shared/command-gateway/rotation.ts";\n',
):
    index = index.replace(duplicate, "")
index = replace_once(
    index,
    'import { createInvitationExecutor } from "../_shared/command-gateway/invitation.ts";\n',
    'import { createInvitationExecutor } from "../_shared/command-gateway/invitation.ts";\n'
    'import { PostgresRotationDatabase } from "../_shared/command-gateway/rotation-database.ts";\n'
    'import { createRotationExecutor } from "../_shared/command-gateway/rotation.ts";\n',
    "index rotation imports",
)
if "const rotationDatabase =" not in index:
    index = replace_once(
        index,
        "const invitationDatabase = new PostgresInvitationDatabase(connectionString);\n",
        "const invitationDatabase = new PostgresInvitationDatabase(connectionString);\n"
        "const rotationDatabase = new PostgresRotationDatabase(connectionString);\n",
        "index rotation database",
    )
if "const rotationExecutor = createRotationExecutor" not in index:
    index = replace_once(
        index,
        "const handler = createCommandGatewayHandler(\n",
        "const rotationExecutor = createRotationExecutor({\n"
        "  database: rotationDatabase,\n"
        "  contextDatabase: database,\n"
        "  schemas,\n"
        "  runtimes: commandGatewayRuntimeRegistry,\n"
        "  now,\n"
        "});\n\n"
        "const handler = createCommandGatewayHandler(\n",
        "index rotation executor",
    )
if "    rotationExecutor,\n" not in index:
    index = replace_once(
        index,
        "    invitationExecutor,\n"
        "  );\n",
        "    invitationExecutor,\n"
        "    rotationExecutor,\n"
        "  );\n",
        "index handler arguments",
    )
index_path.write_text(index, encoding="utf-8")

# Protected validation workflow.
workflow_path = ROOT / ".github/workflows/validate.yml"
workflow = workflow_path.read_text(encoding="utf-8")
if "Validate Expedition rotation" not in workflow:
    workflow = replace_once(
        workflow,
        "      - name: Validate Expedition invitation execution\n"
        "        run: python scripts/validate_expedition_invitation_execution.py\n\n",
        "      - name: Validate Expedition invitation execution\n"
        "        run: python scripts/validate_expedition_invitation_execution.py\n\n"
        "      - name: Validate Expedition rotation\n"
        "        run: python scripts/validate_expedition_rotation.py\n\n",
        "workflow rotation validation",
    )
workflow_path.write_text(workflow, encoding="utf-8")

# Documentation status.
changelog_path = ROOT / "CHANGELOG.md"
changelog = changelog_path.read_text(encoding="utf-8")
if "Gate 9C deterministic initial rotation" not in changelog:
    entry = """## 2026-07-21 — Gate 9C deterministic initial rotation

- Accepted `ADR-020` and synchronized `generate_rotation` as a Captain-only, online-only command with exact empty payload.
- Added a pure deterministic rotation reducer using stable `participants.participant_order`, the sequential onboard cycle and one compatible Day 1 Product Captain.
- Added server-derived SHA-256 seed and stable `rotation_<32 hex>` identity; Cook always receives `product_support`.
- Added `RotationExecutor`, private request validation and service-role-only `private.generate_rotation(jsonb)`.
- Preserved `private.process_command(jsonb)` as the only receipt/event/projection writer and atomically transitioned `ilka.expeditions.status` from `draft` to `ready`.
- Added unit, pgTAP, full gateway/PostgreSQL integration and protected static validation coverage.

Gate 9C adds one reviewed local migration but no rotation table, production runtime registration, cloud migration application, Edge Function deployment, frontend, Day 1 boundary or pilot data.

"""
    changelog = replace_once(
        changelog,
        "# Changelog\n\n",
        "# Changelog\n\n" + entry,
        "CHANGELOG Gate 9C entry",
    )
changelog_path.write_text(changelog, encoding="utf-8")

readme_path = ROOT / "README.md"
readme = readme_path.read_text(encoding="utf-8")
if "Gate 9C deterministic initial rotation is complete locally" not in readme:
    section = """Gate 9C deterministic initial rotation is complete locally under accepted `ADR-020`:

- `generate_rotation` is Captain-only, online-only and accepts no browser assignment, seed or rules fields;
- active Participants are ordered only by stable `participants.participant_order`;
- the pure runtime assigns the sequential onboard cycle, exactly one compatible Product Captain and `product_support` to Cook;
- SHA-256 seed and `rotation_<32 hex>` identity are server-derived from the pinned policy and authoritative team;
- accepted generation appends `rotation.generated → expedition.ready`, replaces the complete `ExpeditionSetupView` and atomically transitions the Expedition from `draft` to `ready`;
- `private.generate_rotation(jsonb)` delegates receipt, events and projection writes to `private.process_command(jsonb)` and no rotation table is introduced;
- unit, pgTAP and complete gateway/PostgreSQL integration coverage is protected in CI.

The production runtime registry remains unchanged. Gate 9D implements `start_expedition` and Day 1 boundary; Gate 9E composes, pins and deploys the protected `day1_pilot_v1` release.

"""
    readme = replace_once(
        readme,
        "## Run the Day 1 prototype\n",
        section + "## Run the Day 1 prototype\n",
        "README Gate 9C status",
    )
validation_line = "python scripts/validate_expedition_rotation.py\n"
if validation_line not in readme:
    marker = "python scripts/validate_expedition_invitation_execution.py\n"
    readme = replace_once(
        readme,
        marker,
        marker + validation_line,
        "README Gate 9C validation command",
    )
readme_path.write_text(readme, encoding="utf-8")

adr18_path = ROOT / "docs/decisions/ADR-018-expedition-setup-and-day1-pilot-runtime.md"
adr18 = adr18_path.read_text(encoding="utf-8")
if "Gate 9C implementation result" not in adr18:
    marker = "## Implementation sequence\n"
    note = """## Gate 9C implementation result

Gate 9C implements the accepted deterministic initial-rotation boundary through `ADR-020`, one pure reducer, one specialized gateway executor and one atomic structural PostgreSQL wrapper. The canonical command now has empty payload, Captain-only authority and server-derived rules/seed. The production runtime registry remains unchanged until Gate 9E.

"""
    adr18 = replace_once(adr18, marker, note + marker, "ADR-018 Gate 9C result")
adr18_path.write_text(adr18, encoding="utf-8")

# Canonical examples.
commands_path = ROOT / "examples/sample-expedition-setup-commands.json"
commands = json.loads(commands_path.read_text(encoding="utf-8"))
commands = [item for item in commands if item.get("command_type") != "generate_rotation"]
commands.append({
    "command_id": "cmd_setup_rotation_01",
    "command_type": "generate_rotation",
    "issued_at": "2026-07-21T17:00:00+02:00",
    "actor_id": "member_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "actor_role": "captain",
    "expedition_id": "ilka_setup_demo",
    "idempotency_key": "cmd_setup_rotation_01",
    "day_number": None,
    "stage_id": None,
    "day_revision": None,
    "payload": {},
})
commands_path.write_text(json.dumps(commands, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

events_path = ROOT / "examples/sample-expedition-setup-events.json"
events = json.loads(events_path.read_text(encoding="utf-8"))
rotation_id = "rotation_0123456789abcdef0123456789abcdef"
seed = "0123456789abcdef" * 4
for item in events:
    if item.get("event_type") == "rotation.generated":
        item["actor_id"] = "member_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
        item["payload"] = {
            "rotation_id": rotation_id,
            "seed": seed,
            "rules_version": 2,
            "assignments": [
                {
                    "participant_id": "participant_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    "product_role_id": "product_captain",
                    "onboard_role_id": "navigation",
                },
                {
                    "participant_id": "participant_cccccccccccccccccccccccccccccccc",
                    "product_role_id": "product_support",
                    "onboard_role_id": "mooring",
                },
                {
                    "participant_id": "participant_dddddddddddddddddddddddddddddddd",
                    "product_role_id": "product_support",
                    "onboard_role_id": "order",
                },
            ],
        }
    elif item.get("event_type") == "expedition.ready":
        item["actor_id"] = "member_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
        item["payload"] = {"rotation_id": rotation_id}
events_path.write_text(json.dumps(events, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

# Focused test/type fixes.
integration_path = ROOT / "supabase/functions/command-gateway/tests/integration/rotation-execution.test.ts"
integration = integration_path.read_text(encoding="utf-8")
integration = replace_once(
    integration,
    'import type { JsonValue } from "../../../_shared/command-gateway/types.ts";\n',
    'import type {\n'
    '  JsonValue,\n'
    '  ProcessCommandResult,\n'
    '} from "../../../_shared/command-gateway/types.ts";\n',
    "rotation integration result import",
)
integration_path.write_text(integration, encoding="utf-8")

validator_path = ROOT / "scripts/validate_expedition_rotation.py"
validator = validator_path.read_text(encoding="utf-8")
validator = validator.replace(
    '            "participants.participant_order" if False else "participant_order",\n',
    '            "participant_order",\n',
)
validator_path.write_text(validator, encoding="utf-8")
