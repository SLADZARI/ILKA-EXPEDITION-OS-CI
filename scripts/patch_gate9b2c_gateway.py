#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

handler_path = ROOT / "supabase/functions/_shared/command-gateway/handler.ts"
handler = handler_path.read_text(encoding="utf-8")
invitation_import = 'import type { InvitationExecutor } from "./invitation.ts";\n'
handler = handler.replace(invitation_import, "")
bootstrap_import = 'import type { BootstrapExecutor } from "./bootstrap.ts";\n'
if bootstrap_import not in handler:
    raise SystemExit("handler bootstrap import missing")
handler = handler.replace(bootstrap_import, bootstrap_import + invitation_import, 1)
if "invitationExecutor?: InvitationExecutor" not in handler:
    raise SystemExit("handler invitation executor parameter missing")
if "invitationExecutor.execute" not in handler:
    raise SystemExit("handler invitation branch missing")
handler_path.write_text(handler, encoding="utf-8")

index_path = ROOT / "supabase/functions/command-gateway/index.ts"
index = index_path.read_text(encoding="utf-8")
for line in (
    'import { PostgresInvitationDatabase } from "../_shared/command-gateway/invitation-database.ts";\n',
    'import { createInvitationExecutor } from "../_shared/command-gateway/invitation.ts";\n',
):
    while index.count(line) > 1:
        index = index.replace(line, "", 1)
constructor = "const invitationDatabase = new PostgresInvitationDatabase(connectionString);\n"
while index.count(constructor) > 1:
    index = index.replace(constructor, "", 1)
if index.count("const invitationExecutor = createInvitationExecutor") != 1:
    raise SystemExit("index invitation executor composition drifted")
if "bootstrapExecutor,\n  invitationExecutor," not in index:
    raise SystemExit("index handler invocation missing invitation executor")
index_path.write_text(index, encoding="utf-8")

adr_path = ROOT / "docs/decisions/ADR-019-invitation-transaction-boundaries.md"
adr = adr_path.read_text(encoding="utf-8")
compatibility = (
    "Gate 9B2A published three private request schemas and added no SQL migration, "
    "reducer, gateway execution branch or read API.\n\n"
)
if "three private request schemas" not in adr:
    marker = "Gate 9B2A published private request schemas, lock semantics, identity rules and stable errors. "
    if marker not in adr:
        raise SystemExit("ADR-019 compatibility insertion point missing")
    adr = adr.replace(marker, compatibility + marker, 1)
adr_path.write_text(adr, encoding="utf-8")

architecture_path = ROOT / "docs/architecture/expedition-invitation-execution.md"
architecture = architecture_path.read_text(encoding="utf-8")
order_line = (
    "The enforced acceptance order remains `membership → process_command → Participant → invitation accepted`.\n\n"
)
if "membership → process_command → Participant → invitation accepted" not in architecture:
    marker = "The SQL wrapper creates the membership before `private.process_command`, then creates the Participant and marks the invitation accepted in the same transaction.\n\n"
    if marker not in architecture:
        raise SystemExit("execution architecture order insertion point missing")
    architecture = architecture.replace(marker, marker + order_line, 1)
architecture_path.write_text(architecture, encoding="utf-8")

validator_path = ROOT / "scripts/validate_expedition_invitation_execution.py"
validator = validator_path.read_text(encoding="utf-8")
validator = validator.replace(
    '            \'crypto.subtle.digest("SHA-256"\',\n',
    '            \'"SHA-256"\',\n',
)
validator_path.write_text(validator, encoding="utf-8")

changelog_path = ROOT / "CHANGELOG.md"
changelog = changelog_path.read_text(encoding="utf-8")
if "Gate 9B2C invitation execution" not in changelog:
    marker = "# Changelog\n\n"
    entry = """## 2026-07-21 — Gate 9B2C invitation execution

- Added pure `invite_participant`, `accept_invitation` and `revoke_invitation` reducers producing canonical invitation events and one complete `ExpeditionSetupView`.
- Added `InvitationExecutor`, verified Auth email context, SHA-256 token hashing, server-derived 168-hour expiry and internal invitation/membership/Participant identity preparation.
- Added the explicit pre-membership `accept_invitation` gateway branch while preserving authentication, Profile ownership, exact replay and runtime pinning.
- Added command-specific private request validation and direct calls only to the Gate 9B2B atomic wrappers.
- Added unit and direct PostgreSQL integration coverage for invite, acceptance, revocation, secret isolation, actor guards and setup readiness.
- Kept the production runtime registry unchanged pending the protected composite `day1_pilot_v1` release.

Gate 9B2C adds no SQL migration, runtime release registration, frontend, deployment, invitation delivery, expiration worker, rotation or pilot data.

"""
    if marker not in changelog:
        raise SystemExit("CHANGELOG header missing")
    changelog = changelog.replace(marker, marker + entry, 1)
changelog_path.write_text(changelog, encoding="utf-8")

readme_path = ROOT / "README.md"
readme = readme_path.read_text(encoding="utf-8")
if "Gate 9B2C invitation execution is complete locally" not in readme:
    marker = "## Run the Day 1 prototype\n"
    section = """Gate 9B2C invitation execution is complete locally under accepted `ADR-019`:

- `invite_participant`, `accept_invitation` and `revoke_invitation` use one specialized `InvitationExecutor` before the generic membership gateway path;
- acceptance verifies confirmed Supabase Auth email and active Profile ownership before preparing the new membership actor;
- raw invitation tokens are SHA-256 hashed and never enter events, projections, receipts or the secret-free nested command payload;
- the pure invitation runtime produces canonical ordered events and one complete `ExpeditionSetupView` replacement;
- atomic writes remain delegated to the three Gate 9B2B PostgreSQL wrappers;
- protected unit and direct PostgreSQL integration tests cover invite, acceptance and revocation.

The production runtime registry remains unchanged. Gate 9E will compose and pin the protected `day1_pilot_v1` runtime before migration application, gateway deployment and pilot smoke.

"""
    if marker not in readme:
        raise SystemExit("README Gate 9B2C insertion point missing")
    readme = readme.replace(marker, section + marker, 1)
validation_marker = "python scripts/validate_expedition_bootstrap_transaction.py\n"
validation_line = "python scripts/validate_expedition_invitation_execution.py\n"
if validation_line not in readme:
    if validation_marker not in readme:
        raise SystemExit("README validation insertion point missing")
    readme = readme.replace(validation_marker, validation_marker + validation_line, 1)
readme_path.write_text(readme, encoding="utf-8")
