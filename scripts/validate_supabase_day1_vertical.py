#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
ADR = ROOT / "docs/decisions/ADR-015-day1-complete-task-runtime-and-read-models.md"
ARCH = ROOT / "docs/architecture/day1-complete-task-runtime.md"
RUNTIME = ROOT / "supabase/functions/_shared/engine-runtime/day1-complete-task-v1.ts"
HANDLER = ROOT / "supabase/functions/_shared/command-gateway/handler.ts"
SCHEMAS = ROOT / "supabase/functions/_shared/command-gateway/schema-validation.ts"
TYPES = ROOT / "supabase/functions/_shared/command-gateway/types.ts"
REGISTRY = ROOT / "supabase/functions/_shared/command-gateway/runtime-registry.ts"
MIGRATION = ROOT / "supabase/migrations/20260720210000_day1_read_model_api.sql"
REGISTRATION_MIGRATION = ROOT / "supabase/migrations/20260720213000_day1_complete_task_runtime_release.sql"
PGTAP = ROOT / "supabase/tests/day1_read_model_api.test.sql"
UNIT = ROOT / "supabase/functions/command-gateway/tests/unit/day1-complete-task-runtime.test.ts"
INTEGRATION = ROOT / "supabase/functions/command-gateway/tests/integration/day1-complete-task.test.ts"
API_DOC = ROOT / "app/api/read-models.yaml"
DB_TYPES = ROOT / "supabase/database.types.ts"
WORKFLOW = ROOT / ".github/workflows/validate.yml"

REQUIRED = (
    ADR,
    ARCH,
    RUNTIME,
    HANDLER,
    SCHEMAS,
    TYPES,
    REGISTRY,
    MIGRATION,
    REGISTRATION_MIGRATION,
    PGTAP,
    UNIT,
    INTEGRATION,
    API_DOC,
    DB_TYPES,
    WORKFLOW,
)


def normalize(text: str) -> str:
    return " ".join(text.lower().replace("`", "").split())


def require(text: str, values: tuple[str, ...], label: str, errors: list[str]) -> None:
    normalized = normalize(text)
    for value in values:
        if normalize(value) not in normalized:
            errors.append(f"{label}: {value}")


def main() -> int:
    errors: list[str] = []
    for path in REQUIRED:
        if not path.is_file():
            errors.append(f"missing Gate 6 file: {path.relative_to(ROOT)}")
    if errors:
        return report(errors)

    adr = ADR.read_text(encoding="utf-8")
    require(
        adr,
        (
            "Status: Accepted",
            "complete_task",
            "task_target_ambiguous_for_captain",
            "task.completed",
            "task.completed_late",
            "api.get_today_view",
            "api.get_captain_day_view",
            "api.get_command_receipt",
            "merge the pure reducer/read-model implementation",
            "must not change reducer behavior",
        ),
        "ADR-015 missing decision",
        errors,
    )

    engine = yaml.safe_load((ROOT / "engine/game-engine.yaml").read_text(encoding="utf-8"))
    complete_task = engine["commands"]["complete_task"]
    if complete_task.get("actor_roles") != ["participant", "product_captain", "captain"]:
        errors.append("complete_task actor roles drifted from Gate 6 contract")
    if complete_task.get("guards") != [
        "assignment_exists",
        "actor_can_complete_assignment",
        "task_not_terminal",
    ]:
        errors.append("complete_task guards drifted from Gate 6 contract")
    if complete_task.get("emits_one_of") != ["task.completed", "task.completed_late"]:
        errors.append("complete_task event alternatives drifted from Gate 6 contract")

    runtime = RUNTIME.read_text(encoding="utf-8")
    require(
        runtime,
        (
            "createDay1CompleteTaskRuntime",
            "TODAY_VIEW_SCHEMA_ID",
            "CAPTAIN_DAY_VIEW_SCHEMA_ID",
            "command_not_implemented_in_runtime",
            "task_target_ambiguous_for_captain",
            "actor_cannot_complete_assignment",
            "task_already_terminal",
            "task.completed_late",
            "occurred_at: input.command.issued_at",
            "recorded_at: input.received_at",
            "today_view:${participantKey}",
            "captain_day_view",
            "input.context.projection_version + 1",
        ),
        "runtime missing vertical behavior",
        errors,
    )
    if re.search(r"\b(fetch|Pool|queryObject|queryArray)\b", runtime):
        errors.append("pure runtime must not query network or PostgreSQL")

    schema_validation = SCHEMAS.read_text(encoding="utf-8")
    require(
        schema_validation,
        (
            "today-view.schema.json",
            "captain-day-view.schema.json",
            "validateProjection",
            "unsupported projection schema",
        ),
        "gateway projection validator missing contract",
        errors,
    )
    if "validateProjection(schemaId: string" not in TYPES.read_text(encoding="utf-8"):
        errors.append("SchemaValidator type lacks validateProjection")

    handler = HANDLER.read_text(encoding="utf-8")
    if handler.count("const projectionIssues =") != 1:
        errors.append("gateway must contain exactly one projection validation pass")
    require(
        handler,
        (
            "validateProjection(mutation.schema_id, mutation.projection)",
            "invalid authoritative projection",
            "database.processCommand",
        ),
        "gateway handler missing projection boundary",
        errors,
    )
    projection_at = handler.find("const projectionIssues =")
    persistence_at = handler.find("dependencies.database.processCommand")
    if not (0 <= projection_at < persistence_at):
        errors.append("projection validation must occur before persistence")

    registry = REGISTRY.read_text(encoding="utf-8")
    require(
        registry,
        (
            "createDay1CompleteTaskRuntime",
            "day1CompleteTaskV1",
            'release_key: "day1_complete_task_v1"',
            'git_commit_sha: "edbfc911e9bcfddfb87a4adb6b39d21e1a5f2617"',
            'rules_release: "engine_v8_permissions_v7_onboarding_v3"',
            'content_release: "day1_content_v1"',
            'reducer_version: "day1_complete_task_v1"',
            "new StaticRuntimeRegistry([",
        ),
        "runtime registry missing exact Day 1 release",
        errors,
    )

    registration_sql = REGISTRATION_MIGRATION.read_text(encoding="utf-8")
    require(
        registration_sql,
        (
            "insert into ilka.runtime_releases",
            "day1_complete_task_v1",
            "edbfc911e9bcfddfb87a4adb6b39d21e1a5f2617",
            "engine_v8_permissions_v7_onboarding_v3",
            "day1_content_v1",
        ),
        "runtime release migration missing exact metadata",
        errors,
    )

    sql = MIGRATION.read_text(encoding="utf-8").lower()
    require(
        sql,
        (
            "create or replace function api.get_today_view(p_expedition_key text)",
            "create or replace function api.get_captain_day_view(p_expedition_key text)",
            "create or replace function api.get_command_receipt(p_command_id text)",
            "security definer",
            "set search_path = ''",
            "auth.uid()",
            "private.resolve_actor_context",
            "private.build_persisted_command_result",
            "grant execute on function api.get_today_view(text) to authenticated, service_role",
            "grant execute on function api.get_captain_day_view(text) to authenticated, service_role",
            "grant execute on function api.get_command_receipt(text) to authenticated, service_role",
        ),
        "read-model migration missing contract",
        errors,
    )
    for function_name in ("get_today_view", "get_captain_day_view", "get_command_receipt"):
        if f"revoke all on function api.{function_name}(text) from public, anon, authenticated, service_role" not in sql:
            errors.append(f"read API must revoke defaults before granting: {function_name}")
    if re.search(r"grant\s+select\s+on\s+ilka\.", sql):
        errors.append("read API migration must not grant raw ilka table access")

    api_doc = yaml.safe_load(API_DOC.read_text(encoding="utf-8"))
    required_functions = {"get_today_view", "get_captain_day_view", "get_command_receipt"}
    documented_functions = set(api_doc.get("functions", {}))
    if not required_functions.issubset(documented_functions):
        missing = sorted(required_functions - documented_functions)
        errors.append(f"app/api/read-models.yaml is missing Gate 6 API functions: {missing}")
    if api_doc.get("security", {}).get("direct_internal_table_access") is not False:
        errors.append("read-model API must deny direct internal table access")

    pgtap = PGTAP.read_text(encoding="utf-8")
    require(
        pgtap,
        (
            "active Participant receives their own TodayView",
            "Participant cannot read CaptainDayView",
            "active Captain receives CaptainDayView",
            "another authenticated actor cannot enumerate a receipt",
            "banned membership cannot read new Participant projections",
            "banned original actor retains access to their historical receipt",
        ),
        "pgTAP missing read isolation scenario",
        errors,
    )

    unit = UNIT.read_text(encoding="utf-8")
    require(
        unit,
        (
            "accepts an assigned on-time task completion",
            "emits task.completed_late after the due day",
            "persists a deterministic rejection for a terminal task",
            "rejects an ambiguous Captain task target",
            "validateProjection",
        ),
        "runtime unit tests missing scenario",
        errors,
    )

    integration = INTEGRATION.read_text(encoding="utf-8")
    require(
        integration,
        (
            "complete_task persists an event and updates Participant/Captain projections",
            "createCommandGatewayHandler",
            "PostgresGatewayDatabase",
            "api.get_today_view",
            "api.get_captain_day_view",
            "api.get_command_receipt",
            "replayed, true",
        ),
        "end-to-end integration missing scenario",
        errors,
    )

    architecture = ARCH.read_text(encoding="utf-8")
    require(
        architecture,
        (
            "one complete write/read cycle",
            "No task table",
            "Product Captain is resolved",
            "Both documents are written as complete JSON objects",
            "original actor after a later membership ban",
            "It must not modify reducer behavior",
        ),
        "Gate 6 architecture missing boundary",
        errors,
    )

    types = DB_TYPES.read_text(encoding="utf-8")
    for function_name in ("get_today_view", "get_captain_day_view", "get_command_receipt"):
        if f"{function_name}:" not in types:
            errors.append(f"generated database types missing api.{function_name}")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(
        workflow,
        (
            "supabase/functions/_shared/engine-runtime",
            "Run command gateway and Engine runtime unit tests",
            "Run command gateway database integration",
            "Validate Supabase Day 1 vertical contract",
        ),
        "protected CI missing Gate 6",
        errors,
    )

    if errors:
        return report(errors)
    print("SUPABASE DAY 1 COMPLETE_TASK VERTICAL CONTRACT OK")
    return 0


def report(errors: list[str]) -> int:
    print("SUPABASE DAY 1 COMPLETE_TASK VERTICAL CONTRACT FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
