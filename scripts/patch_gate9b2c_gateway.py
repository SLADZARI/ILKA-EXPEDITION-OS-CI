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
handler = handler.replace(
    bootstrap_import,
    bootstrap_import + invitation_import,
    1,
)
if "invitationExecutor?: InvitationExecutor" not in handler:
    handler = handler.replace(
        'export function createCommandGatewayHandler(\n'
        '  dependencies: GatewayDependencies,\n'
        '  bootstrapExecutor?: BootstrapExecutor,\n'
        '): (request: Request) => Promise<Response> {',
        'export function createCommandGatewayHandler(\n'
        '  dependencies: GatewayDependencies,\n'
        '  bootstrapExecutor?: BootstrapExecutor,\n'
        '  invitationExecutor?: InvitationExecutor,\n'
        '): (request: Request) => Promise<Response> {',
        1,
    )
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
