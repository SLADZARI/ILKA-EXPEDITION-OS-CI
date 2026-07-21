#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
ADR = ROOT / "docs/decisions/ADR-020-deterministic-initial-rotation.md"
ARCH = ROOT / "docs/architecture/expedition-initial-rotation.md"
ROLE_RULES = ROOT / "engine/role-rotation-rules.yaml"
COMMAND_CATALOG = ROOT / "engine/command-catalog.yaml"
COMMAND_SCHEMA = ROOT / "schemas/command.schema.json"
GAME_ENGINE = ROOT / "engine/game-engine.yaml"
PERMISSIONS = ROOT / "engine/permissions.yaml"
EVENT_CATALOG = ROOT / "engine/event-catalog.yaml"
SETUP_SCHEMA = ROOT / "app/contracts/expedition-setup-view.schema.json"
PRIVATE_SCHEMA = ROOT / "supabase/contracts/private-generate-rotation-request.schema.json"
RUNTIME = ROOT / "supabase/functions/_shared/engine-runtime/expedition-rotation-v1.ts"
EXECUTOR = ROOT / "supabase/functions/_shared/command-gateway/rotation.ts"
DATABASE = ROOT / "supabase/functions/_shared/command-gateway/rotation-database.ts"
REQUEST_VALIDATION = ROOT / "supabase/functions/_shared/command-gateway/rotation-schema-validation.ts"
HANDLER = ROOT / "supabase/functions/_shared/command-gateway/handler.ts"
INDEX = ROOT / "supabase/functions/command-gateway/index.ts"
REGISTRY = ROOT / "supabase/functions/_shared/command-gateway/runtime-registry.ts"
MIGRATION = ROOT / "supabase/migrations/20260721210000_generate_rotation_transaction.sql"
PGTAP = ROOT / "supabase/tests/rotation_transaction.test.sql"
RUNTIME_TEST = ROOT / "supabase/functions/command-gateway/tests/unit/rotation-runtime.test.ts"
EXECUTOR_TEST = ROOT / "supabase/functions/command-gateway/tests/unit/rotation-executor.test.ts"
HANDLER_TEST = ROOT / "supabase/functions/command-gateway/tests/unit/rotation-handler.test.ts"
INTEGRATION_TEST = ROOT / "supabase/functions/command-gateway/tests/integration/rotation-execution.test.ts"
GENERATED_CONTRACT = ROOT / "supabase/functions/_shared/command-gateway/command-contract.generated.ts"
DATABASE_TYPES = ROOT / "supabase/database.types.ts"
WORKFLOW = ROOT / ".github/workflows/validate.yml"
CHANGELOG = ROOT / "CHANGELOG.md"
README = ROOT / "README.md"

REQUIRED = (
    ADR,
    ARCH,
    ROLE_RULES,
    COMMAND_CATALOG,
    COMMAND_SCHEMA,
    GAME_ENGINE,
    PERMISSIONS,
    EVENT_CATALOG,
    SETUP_SCHEMA,
    PRIVATE_SCHEMA,
    RUNTIME,
    EXECUTOR,
    DATABASE,
    REQUEST_VALIDATION,
    HANDLER,
    INDEX,
    REGISTRY,
    MIGRATION,
    PGTAP,
    RUNTIME_TEST,
    EXECUTOR_TEST,
    HANDLER_TEST,
    INTEGRATION_TEST,
    GENERATED_CONTRACT,
    DATABASE_TYPES,
    WORKFLOW,
    CHANGELOG,
    README,
)


def report(errors: list[str]) -> int:
    print("EXPEDITION ROTATION FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


def require(text: str, values: tuple[str, ...], label: str, errors: list[str]) -> None:
    for value in values:
        if value not in text:
            errors.append(f"{label}: missing {value}")


def main() -> int:
    errors: list[str] = []
    for path in REQUIRED:
        if not path.is_file():
            errors.append(f"missing Gate 9C file: {path.relative_to(ROOT)}")
    if errors:
        return report(errors)

    adr = ADR.read_text(encoding="utf-8")
    require(
        adr,
        (
            "Status: Accepted",
            "participants.participant_order",
            "payload: {}",
            "rotation.generated",
            "expedition.ready",
            "private.generate_rotation(jsonb)",
            "No rotation table is introduced",
            "production `commandGatewayRuntimeRegistry`",
        ),
        "ADR-020",
        errors,
    )

    role_rules = yaml.safe_load(ROLE_RULES.read_text(encoding="utf-8"))
    rotation = role_rules.get("rotation", {})
    if rotation.get("participant_order_source") != "participants.participant_order":
        errors.append("role rotation source must be participants.participant_order")
    if role_rules.get("onboard_role_cycle") != [
        "navigation",
        "mooring",
        "order",
        "cook",
        "product_focus",
    ]:
        errors.append("onboard role cycle drifted")
    initial = role_rules.get("initial_rotation", {})
    if initial.get("product_captain_selection") != "lowest_participant_order_not_cook":
        errors.append("initial Product Captain selection missing")
    if initial.get("cook_product_role") != "product_support":
        errors.append("Cook low-load product role missing")

    command_catalog = yaml.safe_load(COMMAND_CATALOG.read_text(encoding="utf-8"))
    rotation_command = next(
        (
            command
            for command in command_catalog.get("commands", [])
            if command.get("command_type") == "generate_rotation"
        ),
        None,
    )
    if not rotation_command:
        errors.append("command catalog missing generate_rotation")
    else:
        if rotation_command.get("allowed_actors") != ["captain"]:
            errors.append("generate_rotation must be Captain-only")
        if rotation_command.get("payload_required") != []:
            errors.append("generate_rotation payload_required must be empty")
        if rotation_command.get("offline_allowed") is not False:
            errors.append("generate_rotation must be online-only")

    command_schema = json.loads(COMMAND_SCHEMA.read_text(encoding="utf-8"))
    rotation_then = None
    for conditional in command_schema.get("allOf", []):
        condition = conditional.get("if", {}).get("properties", {}).get("command_type", {})
        if condition.get("const") == "generate_rotation":
            rotation_then = conditional.get("then", {})
            break
    if rotation_then is None:
        errors.append("command schema missing generate_rotation conditional")
    else:
        payload = rotation_then.get("properties", {}).get("payload", {})
        if payload.get("required") != []:
            errors.append("generate_rotation schema payload required must be empty")
        if payload.get("additionalProperties") is not False:
            errors.append("generate_rotation schema must reject browser fields")
        if payload.get("properties") != {}:
            errors.append("generate_rotation schema must define no browser properties")

    game_engine = yaml.safe_load(GAME_ENGINE.read_text(encoding="utf-8"))
    game_rotation = game_engine.get("commands", {}).get("generate_rotation", {})
    if game_rotation.get("actor_roles") != ["captain"]:
        errors.append("game engine generate_rotation actor must be Captain only")
    if game_rotation.get("emits") != ["rotation.generated", "expedition.ready"]:
        errors.append("game engine rotation event order drifted")

    permissions = yaml.safe_load(PERMISSIONS.read_text(encoding="utf-8"))
    if "generate_rotation" not in permissions.get("roles", {}).get("captain", {}).get("can", []):
        errors.append("Captain generate_rotation permission missing")
    if "generate_rotation" in permissions.get("roles", {}).get("system", {}).get("can", []):
        errors.append("system must not own pilot generate_rotation permission")
    if permissions.get("restrictions", {}).get("rotation_generation") != "captain_only_server_confirmed":
        errors.append("rotation_generation restriction missing")

    event_catalog = EVENT_CATALOG.read_text(encoding="utf-8")
    require(
        event_catalog,
        (
            "event_type: rotation.generated",
            "event_type: expedition.ready",
            "- assignments",
            "- rotation_id",
        ),
        "event catalog",
        errors,
    )

    setup_schema = json.loads(SETUP_SCHEMA.read_text(encoding="utf-8"))
    assignments = (
        setup_schema.get("properties", {})
        .get("rotation", {})
        .get("properties", {})
        .get("assignments", {})
    )
    if assignments.get("maxItems") != 5:
        errors.append("setup rotation assignments must remain bounded to five")

    private_schema = json.loads(PRIVATE_SCHEMA.read_text(encoding="utf-8"))
    if private_schema.get("required") != [
        "expedition_transition",
        "process_command_request",
    ]:
        errors.append("private rotation request required fields drifted")

    runtime = RUNTIME.read_text(encoding="utf-8")
    require(
        runtime,
        (
            "createExpeditionRotationRuntime",
            "isExpeditionRotationRuntime",
            '"SHA-256"',
            "participants.participant_order" if False else "participant_order",
            "lowest",
            'candidate.onboard_role_id !== "cook"',
            'event(input, 1, "rotation.generated"',
            'event(input, 2, "expedition.ready"',
            'view.expedition_status = "ready"',
            "input.context.projection_version + 1",
        ),
        "rotation runtime",
        errors,
    )
    for forbidden in ("Pool", "queryObject", "queryArray", "fetch("):
        if forbidden in runtime:
            errors.append(f"pure rotation runtime must not use {forbidden}")

    executor = EXECUTOR.read_text(encoding="utf-8")
    require(
        executor,
        (
            "createRotationExecutor",
            "isExpeditionRotationRuntime",
            "validatePreparedEvent",
            "validateProjection",
            "requestValidator.validate",
            "generateRotation(outerRequest)",
            "rotation_persistence_unavailable",
        ),
        "RotationExecutor",
        errors,
    )
    if "processCommand(" in executor or "private.process_command" in executor:
        errors.append("RotationExecutor must not call generic processCommand directly")

    database = DATABASE.read_text(encoding="utf-8")
    require(
        database,
        (
            "class PostgresRotationDatabase",
            "set local role service_role",
            "private.generate_rotation",
        ),
        "rotation database adapter",
        errors,
    )

    handler = HANDLER.read_text(encoding="utf-8")
    require(
        handler,
        (
            "RotationExecutor",
            'command.command_type === "generate_rotation"',
            "rotationExecutor.execute",
        ),
        "gateway rotation branch",
        errors,
    )
    receipt_at = handler.find("dependencies.database.getReceipt")
    invitation_at = handler.find("invitationExecutor.execute")
    rotation_at = handler.find("rotationExecutor.execute")
    generic_context_at = handler.find("dependencies.database.loadContext")
    if not (0 <= receipt_at < invitation_at < rotation_at < generic_context_at):
        errors.append("gateway order must be receipt → invitation → rotation → generic context")

    index = INDEX.read_text(encoding="utf-8")
    require(
        index,
        (
            "new PostgresRotationDatabase",
            "createRotationExecutor",
            "contextDatabase: database",
            "rotationExecutor",
        ),
        "Edge Function rotation composition",
        errors,
    )

    registry = REGISTRY.read_text(encoding="utf-8")
    if "createExpeditionRotationRuntime" in registry or "rotation_policy" in registry:
        errors.append("Gate 9C must not register production rotation runtime")

    migration = MIGRATION.read_text(encoding="utf-8").lower()
    require(
        migration,
        (
            "create or replace function private.generate_rotation(p_request jsonb)",
            "security definer",
            "set search_path = ''",
            "'ilka:command:'",
            "'ilka:expedition:'",
            "private.process_command(v_process_request)",
            "update ilka.expeditions",
            "set status = 'ready'",
            "rotation.generated",
            "expedition.ready",
            "grant execute on function private.generate_rotation(jsonb) to service_role",
        ),
        "rotation migration",
        errors,
    )
    for forbidden in (
        "insert into ilka.command_receipts",
        "insert into ilka.event_log",
        "insert into ilka.projection_documents",
        "commit;\nend;",
    ):
        if forbidden in migration:
            errors.append(f"rotation wrapper contains forbidden persistence: {forbidden}")

    pgtap = PGTAP.read_text(encoding="utf-8")
    require(
        pgtap,
        (
            "private.generate_rotation(jsonb) exists",
            "service_role can execute rotation wrapper",
            "authenticated cannot execute private rotation wrapper",
            "rotation wrapper delegates immutable persistence",
        ),
        "rotation pgTAP",
        errors,
    )

    runtime_test = RUNTIME_TEST.read_text(encoding="utf-8")
    require(
        runtime_test,
        (
            "three Participants receive deterministic initial roles",
            "four Participants assign Cook only product_support",
            "five Participants cover the complete onboard cycle",
            "pending invitations block rotation",
            "duplicate Participant order is rejected",
        ),
        "rotation runtime tests",
        errors,
    )
    executor_test = EXECUTOR_TEST.read_text(encoding="utf-8")
    require(
        executor_test,
        (
            "prepares one trusted atomic wrapper request",
            "rejects non-Captain context before persistence",
            "requires exact pinned rotation runtime",
            "maps stable wrapper failures",
        ),
        "rotation executor tests",
        errors,
    )
    handler_test = HANDLER_TEST.read_text(encoding="utf-8")
    require(
        handler_test,
        (
            "before generic membership handling",
            "RotationExecutor is absent",
            "stable RotationExecutor failures",
        ),
        "rotation handler tests",
        errors,
    )
    integration = INTEGRATION_TEST.read_text(encoding="utf-8")
    require(
        integration,
        (
            "persists deterministic assignments, ready state and exact replay",
            "rotation.generated",
            "expedition.ready",
            'assertEquals(expedition.rows[0]?.status, "ready")',
            "replayed, true",
        ),
        "rotation integration",
        errors,
    )

    generated = GENERATED_CONTRACT.read_text(encoding="utf-8")
    if not re.search(
        r'"generate_rotation":\s*\{\s*"allowedActors":\s*\[\s*"captain"\s*\]',
        generated,
        re.S,
    ):
        errors.append("generated gateway contract must make rotation Captain-only")

    if "generate_rotation: { Args: { p_request: Json }; Returns: Json }" not in DATABASE_TYPES.read_text(encoding="utf-8"):
        errors.append("generated database types missing private.generate_rotation")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(
        workflow,
        (
            "Validate Expedition rotation",
            "python scripts/validate_expedition_rotation.py",
        ),
        "protected workflow",
        errors,
    )

    if "Gate 9C deterministic initial rotation" not in CHANGELOG.read_text(encoding="utf-8"):
        errors.append("CHANGELOG missing Gate 9C record")
    if "Gate 9C deterministic initial rotation is complete locally" not in README.read_text(encoding="utf-8"):
        errors.append("README missing Gate 9C status")

    extra_rotation_migrations = [
        path.name
        for path in (ROOT / "supabase/migrations").glob("*.sql")
        if "rotation" in path.name and path != MIGRATION
    ]
    if extra_rotation_migrations:
        errors.append(f"unexpected parallel rotation migrations: {extra_rotation_migrations}")

    if errors:
        return report(errors)
    print("EXPEDITION ROTATION OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
