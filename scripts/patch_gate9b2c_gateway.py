#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

handler_path = ROOT / "supabase/functions/_shared/command-gateway/handler.ts"
handler = handler_path.read_text(encoding="utf-8")

handler = handler.replace(
    'import type { BootstrapExecutor } from "./bootstrap.ts";\n',
    'import type { BootstrapExecutor } from "./bootstrap.ts";\n'
    'import type { InvitationExecutor } from "./invitation.ts";\n',
    1,
)
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
needle = '''    let context: GatewayExecutionContext | null;
'''
branch = '''    if (
      command.command_type === "invite_participant" ||
      command.command_type === "accept_invitation" ||
      command.command_type === "revoke_invitation"
    ) {
      if (!invitationExecutor) {
        return errorResponse(
          503,
          requestId,
          "runtime_release_unavailable",
          "The Expedition's pinned invitation runtime is unavailable.",
          true,
          origin,
          true,
        );
      }

      let outcome;
      try {
        outcome = await invitationExecutor.execute({
          command,
          auth_user: authUser,
          request_hash: requestHash,
        });
      } catch {
        return errorResponse(
          503,
          requestId,
          "invitation_persistence_unavailable",
          "The invitation command could not be committed.",
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

    let context: GatewayExecutionContext | null;
'''
if "invitationExecutor.execute" not in handler:
    if needle not in handler:
        raise SystemExit("handler insertion point missing")
    handler = handler.replace(needle, branch, 1)
handler_path.write_text(handler, encoding="utf-8")

index_path = ROOT / "supabase/functions/command-gateway/index.ts"
index = index_path.read_text(encoding="utf-8")
index = index.replace(
    'import { createCommandGatewayHandler } from "../_shared/command-gateway/handler.ts";\n',
    'import { createCommandGatewayHandler } from "../_shared/command-gateway/handler.ts";\n'
    'import { PostgresInvitationDatabase } from "../_shared/command-gateway/invitation-database.ts";\n'
    'import { createInvitationExecutor } from "../_shared/command-gateway/invitation.ts";\n',
    1,
)
index = index.replace(
    'const bootstrapDatabase = new PostgresBootstrapDatabase(connectionString);\n',
    'const bootstrapDatabase = new PostgresBootstrapDatabase(connectionString);\n'
    'const invitationDatabase = new PostgresInvitationDatabase(connectionString);\n',
    1,
)
executor_needle = '''const handler = createCommandGatewayHandler({
'''
executor = '''const invitationExecutor = createInvitationExecutor({
  database: invitationDatabase,
  contextDatabase: database,
  schemas,
  runtimes: commandGatewayRuntimeRegistry,
  now,
  uuid: () => crypto.randomUUID(),
});

const handler = createCommandGatewayHandler({
'''
if "const invitationExecutor =" not in index:
    if executor_needle not in index:
        raise SystemExit("index executor insertion point missing")
    index = index.replace(executor_needle, executor, 1)
index = index.replace(
    '}, bootstrapExecutor);\n',
    '}, bootstrapExecutor, invitationExecutor);\n',
    1,
)
index_path.write_text(index, encoding="utf-8")
