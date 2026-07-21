#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "supabase/functions/_shared/engine-runtime/expedition-invitations-v1.ts"
EXECUTOR = ROOT / "supabase/functions/_shared/command-gateway/invitation.ts"
DATABASE = ROOT / "supabase/functions/_shared/command-gateway/invitation-database.ts"
PRIVATE_VALIDATION = ROOT / "supabase/functions/_shared/command-gateway/invitation-schema-validation.ts"
HANDLER = ROOT / "supabase/functions/_shared/command-gateway/handler.ts"
INDEX = ROOT / "supabase/functions/command-gateway/index.ts"
AUTH = ROOT / "supabase/functions/_shared/command-gateway/auth.ts"
TYPES = ROOT / "supabase/functions/_shared/command-gateway/types.ts"
SCHEMAS = ROOT / "supabase/functions/_shared/command-gateway/schema-validation.ts"
REGISTRY = ROOT / "supabase/functions/_shared/command-gateway/runtime-registry.ts"
ARCH = ROOT / "docs/architecture/expedition-invitation-execution.md"
ADR = ROOT / "docs/decisions/ADR-019-invitation-transaction-boundaries.md"
CHANGELOG = ROOT / "CHANGELOG.md"
WORKFLOW = ROOT / ".github/workflows/validate.yml"
RUNTIME_TEST = ROOT / "supabase/functions/command-gateway/tests/unit/invitation-runtime.test.ts"
EXECUTOR_TEST = ROOT / "supabase/functions/command-gateway/tests/unit/invitation-executor.test.ts"
HANDLER_TEST = ROOT / "supabase/functions/command-gateway/tests/unit/invitation-handler.test.ts"
AUTH_TEST = ROOT / "supabase/functions/command-gateway/tests/unit/auth-email.test.ts"
INTEGRATION = ROOT / "supabase/functions/command-gateway/tests/integration/invitation-execution.test.ts"

REQUIRED = (
    RUNTIME,
    EXECUTOR,
    DATABASE,
    PRIVATE_VALIDATION,
    HANDLER,
    INDEX,
    AUTH,
    TYPES,
    SCHEMAS,
    REGISTRY,
    ARCH,
    ADR,
    CHANGELOG,
    WORKFLOW,
    RUNTIME_TEST,
    EXECUTOR_TEST,
    HANDLER_TEST,
    AUTH_TEST,
    INTEGRATION,
)


def normalize(text: str) -> str:
    return " ".join(text.lower().replace("`", "").split())


def require(text: str, values: tuple[str, ...], label: str, errors: list[str]) -> None:
    normalized = normalize(text)
    for value in values:
        if normalize(value) not in normalized:
            errors.append(f"{label}: missing {value}")


def report(errors: list[str]) -> int:
    print("EXPEDITION INVITATION EXECUTION FAILED", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    return 1


def main() -> int:
    errors: list[str] = []
    for path in REQUIRED:
        if not path.is_file():
            errors.append(f"missing Gate 9B2C file: {path.relative_to(ROOT)}")
    if errors:
        return report(errors)

    runtime = RUNTIME.read_text(encoding="utf-8")
    require(
        runtime,
        (
            "createExpeditionInvitationRuntime",
            "isExpeditionInvitationRuntime",
            "team_size_min",
            "team_size_max",
            "invitation_ttl_hours",
            "invitation.created",
            "invitation.accepted",
            "participant.added",
            "invitation.revoked",
            "expedition_setup_view",
            "input.context.projection_version + 1",
            "occurred_at: input.command.issued_at",
            "recorded_at: input.received_at",
            "team_minimum_not_met",
            "pending_invitation",
            "rotation_not_generated",
        ),
        "invitation runtime",
        errors,
    )
    for forbidden in ("Pool", "queryObject", "queryArray", "fetch("):
        if forbidden in runtime:
            errors.append(f"pure invitation runtime must not use {forbidden}")

    executor = EXECUTOR.read_text(encoding="utf-8")
    require(
        executor,
        (
            "createInvitationExecutor",
            '"SHA-256"',
            "invitation_ttl_hours * 60 * 60 * 1000",
            "loadActiveProfile",
            "loadAcceptanceCandidate",
            "participant_id: null",
            "canonicalSecretFreeCommand",
            "payload: {}",
            "validatePreparedEvent",
            "validateProjection",
            "validateAccept",
            "validateInvite",
            "validateRevoke",
            "inviteParticipant",
            "acceptInvitation",
            "revokeInvitation",
            "invitation_email_mismatch",
            "runtime_release_unavailable",
        ),
        "InvitationExecutor",
        errors,
    )
    if "processCommand(" in executor or "private.process_command" in executor:
        errors.append("InvitationExecutor must not call generic processCommand directly")

    database = DATABASE.read_text(encoding="utf-8")
    require(
        database,
        (
            "class PostgresInvitationDatabase",
            "set local role service_role",
            "private.invite_participant",
            "private.accept_invitation",
            "private.revoke_invitation",
            "generate_series(1, 5)",
        ),
        "invitation database adapter",
        errors,
    )

    private_validation = PRIVATE_VALIDATION.read_text(encoding="utf-8")
    require(
        private_validation,
        (
            "private-invitation-process-command-request.schema.json",
            "private-invite-participant-request.schema.json",
            "private-accept-invitation-request.schema.json",
            "private-revoke-invitation-request.schema.json",
            "expedition-setup-view.schema.json",
        ),
        "private invitation schema validator",
        errors,
    )

    handler = HANDLER.read_text(encoding="utf-8")
    require(
        handler,
        (
            "InvitationExecutor",
            "invitationExecutor.execute",
            'command.command_type === "invite_participant"',
            'command.command_type === "accept_invitation"',
            'command.command_type === "revoke_invitation"',
        ),
        "command gateway invitation branch",
        errors,
    )
    receipt_at = handler.find("dependencies.database.getReceipt")
    invitation_at = handler.find("invitationExecutor.execute")
    generic_context_at = handler.find("dependencies.database.loadContext")
    if not (0 <= receipt_at < invitation_at < generic_context_at):
        errors.append("gateway order must be receipt → invitation branch → generic membership context")
    if handler.count('import type { InvitationExecutor } from "./invitation.ts";') != 1:
        errors.append("handler must import InvitationExecutor exactly once")

    index = INDEX.read_text(encoding="utf-8")
    require(
        index,
        (
            "new PostgresInvitationDatabase",
            "createInvitationExecutor",
            "contextDatabase: database",
            "bootstrapExecutor",
            "invitationExecutor",
        ),
        "Edge Function composition",
        errors,
    )
    if index.count("const invitationDatabase =") != 1:
        errors.append("index must construct one invitation database adapter")

    auth = AUTH.read_text(encoding="utf-8")
    require(
        auth,
        (
            "email_confirmed_at",
            "email_verified",
            "body.email",
        ),
        "Auth verifier",
        errors,
    )
    types = TYPES.read_text(encoding="utf-8")
    require(types, ("email?: string | null", "email_verified?: boolean"), "AuthUser", errors)

    schemas = SCHEMAS.read_text(encoding="utf-8")
    require(
        schemas,
        (
            "expedition-setup-view.schema.json",
            "expeditionSetupViewSchema.$id",
        ),
        "generic projection validation",
        errors,
    )

    registry = REGISTRY.read_text(encoding="utf-8")
    if "createExpeditionInvitationRuntime" in registry or "invitation_policy" in registry:
        errors.append("Gate 9B2C must not register a production invitation runtime")

    architecture = ARCH.read_text(encoding="utf-8")
    require(
        architecture,
        (
            "Status: Gate 9B2C execution implementation",
            "command-gateway replay check",
            "pre-membership acceptance",
            "expires_at = received_at + 168 hours",
            "membership → process_command → Participant → invitation accepted",
            "production runtime registry remains unchanged",
            "no migration, deployment or cloud/pilot data is added",
        ),
        "Gate 9B2C architecture",
        errors,
    )

    adr = ADR.read_text(encoding="utf-8")
    require(
        adr,
        (
            "Gate 9B2C",
            "InvitationExecutor",
            "pre-membership gateway path",
            "production runtime registry remains unchanged",
        ),
        "ADR-019 Gate 9B2C update",
        errors,
    )

    changelog = CHANGELOG.read_text(encoding="utf-8")
    if "Gate 9B2C invitation execution" not in changelog:
        errors.append("CHANGELOG missing Gate 9B2C record")

    workflow = WORKFLOW.read_text(encoding="utf-8")
    require(
        workflow,
        (
            "Validate Expedition invitation execution",
            "python scripts/validate_expedition_invitation_execution.py",
        ),
        "protected workflow",
        errors,
    )

    runtime_test = RUNTIME_TEST.read_text(encoding="utf-8")
    require(
        runtime_test,
        (
            "initializes a complete secret-free setup projection",
            "creates the third Participant and enables rotation",
            "marks one pending invitation terminal",
            "requires an existing ExpeditionSetupView",
            "rejects a spoofed membership actor",
        ),
        "runtime tests",
        errors,
    )
    executor_test = EXECUTOR_TEST.read_text(encoding="utf-8")
    require(
        executor_test,
        (
            "hashes token, applies server TTL and persists no raw secret",
            "creates membership-attributed trusted request",
            "verified-email mismatch before persistence",
            "requires a verified Auth email",
            "exact pinned invitation runtime",
        ),
        "executor tests",
        errors,
    )
    handler_test = HANDLER_TEST.read_text(encoding="utf-8")
    require(
        handler_test,
        (
            "pre-membership accept_invitation",
            "before generic context loading",
            "stable InvitationExecutor failures",
        ),
        "handler tests",
        errors,
    )
    integration = INTEGRATION.read_text(encoding="utf-8")
    require(
        integration,
        (
            "bootstrapExpedition",
            "cmd_invitation_execution_invite_1",
            "cmd_invitation_execution_accept_1",
            "cmd_invitation_execution_revoke_2",
            "invitation.accepted",
            "participant.added",
            "projection_version, 4",
        ),
        "invitation integration",
        errors,
    )

    forbidden_migrations = [
        path.name
        for path in (ROOT / "supabase/migrations").glob("*.sql")
        if "9b2c" in path.name.lower() or "invitation_execution" in path.name.lower()
    ]
    if forbidden_migrations:
        errors.append(f"Gate 9B2C must not add migrations: {forbidden_migrations}")

    if errors:
        return report(errors)
    print("EXPEDITION INVITATION EXECUTION OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
