from __future__ import annotations

from pathlib import Path


HANDLER = Path("supabase/functions/_shared/command-gateway/handler.ts")
INDEX = Path("supabase/functions/command-gateway/index.ts")
WORKFLOW = Path(".github/workflows/apply-gate9d2b-routing.yml")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one marker, found {count}")
    return text.replace(old, new, 1)


def patch_handler() -> None:
    text = HANDLER.read_text(encoding="utf-8")
    text = replace_once(
        text,
        'import type { RotationExecutor } from "./rotation.ts";\n',
        'import type { RotationExecutor } from "./rotation.ts";\n'
        'import type { StartExecutor } from "./start.ts";\n',
        "handler import",
    )
    text = replace_once(
        text,
        "  invitationExecutor?: InvitationExecutor,\n"
        "  rotationExecutor?: RotationExecutor,\n"
        "): (request: Request) => Promise<Response> {",
        "  invitationExecutor?: InvitationExecutor,\n"
        "  rotationExecutor?: RotationExecutor,\n"
        "  startExecutor?: StartExecutor,\n"
        "): (request: Request) => Promise<Response> {",
        "handler signature",
    )
    start_branch = '''
    if (command.command_type === "start_expedition") {
      if (!startExecutor) {
        return errorResponse(
          503,
          requestId,
          "runtime_release_unavailable",
          "The Expedition start runtime is not available.",
          true,
          origin,
          true,
        );
      }

      let outcome: Awaited<ReturnType<StartExecutor["execute"]>>;
      try {
        outcome = await startExecutor.execute({
          command,
          auth_user: authUser,
          request_hash: requestHash,
        });
      } catch {
        return errorResponse(
          503,
          requestId,
          "start_persistence_unavailable",
          "The Expedition could not be started.",
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
        {
          request_id: requestId,
          data: outcome.result,
        },
        origin,
        true,
      );
    }

'''
    text = replace_once(
        text,
        "    let context: GatewayExecutionContext | null;\n",
        start_branch + "    let context: GatewayExecutionContext | null;\n",
        "start routing insertion",
    )
    HANDLER.write_text(text, encoding="utf-8")


def patch_index() -> None:
    text = INDEX.read_text(encoding="utf-8")
    text = replace_once(
        text,
        'import { createRotationExecutor } from "../_shared/command-gateway/rotation.ts";\n',
        'import { createRotationExecutor } from "../_shared/command-gateway/rotation.ts";\n'
        'import { PostgresStartDatabase } from "../_shared/command-gateway/start-database.ts";\n'
        'import { createStartExecutor } from "../_shared/command-gateway/start.ts";\n',
        "index imports",
    )
    text = replace_once(
        text,
        "const rotationDatabase = new PostgresRotationDatabase(connectionString);\n",
        "const rotationDatabase = new PostgresRotationDatabase(connectionString);\n"
        "const startDatabase = new PostgresStartDatabase(connectionString);\n",
        "index database",
    )
    text = replace_once(
        text,
        "const rotationExecutor = createRotationExecutor({\n"
        "  database: rotationDatabase,\n"
        "  contextDatabase: database,\n"
        "  schemas,\n"
        "  runtimes: commandGatewayRuntimeRegistry,\n"
        "  now,\n"
        "});\n\n",
        "const rotationExecutor = createRotationExecutor({\n"
        "  database: rotationDatabase,\n"
        "  contextDatabase: database,\n"
        "  schemas,\n"
        "  runtimes: commandGatewayRuntimeRegistry,\n"
        "  now,\n"
        "});\n\n"
        "const startExecutor = createStartExecutor({\n"
        "  database: startDatabase,\n"
        "  contextDatabase: database,\n"
        "  schemas,\n"
        "  runtimes: commandGatewayRuntimeRegistry,\n"
        "  now,\n"
        "});\n\n",
        "index executor",
    )
    text = replace_once(
        text,
        "  rotationExecutor,\n"
        ");\n",
        "  rotationExecutor,\n"
        "  startExecutor,\n"
        ");\n",
        "index handler composition",
    )
    INDEX.write_text(text, encoding="utf-8")


def main() -> None:
    patch_handler()
    patch_index()
    Path(__file__).unlink()
    WORKFLOW.unlink()


if __name__ == "__main__":
    main()
